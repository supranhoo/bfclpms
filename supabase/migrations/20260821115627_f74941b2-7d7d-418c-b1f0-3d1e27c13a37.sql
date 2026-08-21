-- ADR-308a: recursive (cascade-aware) dependency impact for org master deletion.

DROP FUNCTION IF EXISTS public.org_master_delete_impact(text, uuid);

CREATE OR REPLACE FUNCTION public.org_master_delete_impact_at(
  p_table text,
  p_id uuid,
  p_path text,
  p_depth int
)
RETURNS TABLE (
  child_table    text,
  child_column   text,
  delete_action  text,
  row_count      bigint,
  classification text,
  labels         text[],
  via_path       text,
  target_table   text,
  target_id      uuid
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  r record;
  v_count bigint;
  v_labels text[];
  v_class text;
  v_has_id boolean;
  v_has_name boolean;
  v_child record;
  v_next_path text;
BEGIN
  IF p_depth > 4 THEN
    RETURN;
  END IF;

  FOR r IN
    SELECT c.conrelid::regclass::text  AS tbl,
           a.attname::text             AS col,
           c.confdeltype::text         AS act,
           d.table_name IS NOT NULL    AS is_cleanable,
           d.label_sql                 AS label_sql
    FROM pg_constraint c
    JOIN unnest(c.conkey) AS k(attnum) ON true
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.attnum
    LEFT JOIN public.org_master_cleanable_dependencies d
           ON d.table_name = c.conrelid::regclass::text
    WHERE c.contype = 'f'
      AND c.confrelid = format('public.%I', p_table)::regclass
      AND array_length(c.conkey, 1) = 1
  LOOP
    EXECUTE format('SELECT count(*) FROM public.%I WHERE %I = $1', r.tbl, r.col)
      INTO v_count USING p_id;

    IF v_count = 0 THEN
      CONTINUE;
    END IF;

    IF r.is_cleanable THEN
      v_class := 'cleanable';
    ELSIF r.act IN ('c', 'n', 'd') THEN
      v_class := 'auto';
    ELSE
      v_class := 'blocking';
    END IF;

    v_labels := '{}'::text[];
    IF r.label_sql IS NOT NULL THEN
      BEGIN
        EXECUTE format(r.label_sql, r.col, p_id) INTO v_labels;
      EXCEPTION WHEN others THEN
        v_labels := '{}'::text[];
      END;
    END IF;

    RETURN QUERY SELECT r.tbl, r.col, r.act, v_count, v_class,
                        coalesce(v_labels, '{}'::text[]), p_path, p_table, p_id;

    -- Cascade children are themselves deleted, so their own dependencies
    -- (which may RESTRICT) must be reported as dependencies of this record.
    IF r.act = 'c' AND v_count <= 200 THEN
      SELECT EXISTS (SELECT 1 FROM information_schema.columns
                      WHERE table_schema = 'public' AND table_name = r.tbl AND column_name = 'id'),
             EXISTS (SELECT 1 FROM information_schema.columns
                      WHERE table_schema = 'public' AND table_name = r.tbl AND column_name = 'name')
        INTO v_has_id, v_has_name;

      IF v_has_id THEN
        FOR v_child IN EXECUTE format(
          'SELECT id::uuid AS id, %s AS nm FROM public.%I WHERE %I = $1',
          CASE WHEN v_has_name THEN 'name::text' ELSE 'NULL::text' END, r.tbl, r.col)
          USING p_id
        LOOP
          v_next_path := coalesce(nullif(p_path, '') || ' > ', '')
                         || replace(r.tbl, '_', ' ')
                         || coalesce(' "' || v_child.nm || '"', '');
          RETURN QUERY SELECT * FROM public.org_master_delete_impact_at(
            r.tbl, v_child.id, v_next_path, p_depth + 1);
        END LOOP;
      END IF;
    END IF;
  END LOOP;
END;
$fn$;

REVOKE ALL ON FUNCTION public.org_master_delete_impact_at(text, uuid, text, int) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.org_master_delete_impact(p_entity_type text, p_entity_id uuid)
RETURNS TABLE (
  child_table    text,
  child_column   text,
  delete_action  text,
  row_count      bigint,
  classification text,
  labels         text[],
  via_path       text,
  target_table   text,
  target_id      uuid
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_table text := public.org_master_table(p_entity_type);
BEGIN
  IF v_table IS NULL THEN
    RAISE EXCEPTION 'Unknown organisation master type: %', p_entity_type;
  END IF;

  RETURN QUERY SELECT * FROM public.org_master_delete_impact_at(v_table, p_entity_id, '', 0);
END;
$fn$;

REVOKE ALL ON FUNCTION public.org_master_delete_impact(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.org_master_delete_impact(text, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.org_master_delete(
  p_entity_type text,
  p_entity_id uuid,
  p_cleanup_dependencies boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_table text := public.org_master_table(p_entity_type);
  v_name text;
  v_blocking text := '';
  v_cleanable_count bigint := 0;
  v_cleaned jsonb := '{}'::jsonb;
  v_key text;
  r record;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only administrators can delete organisation master records';
  END IF;

  IF v_table IS NULL THEN
    RAISE EXCEPTION 'Unknown organisation master type: %', p_entity_type;
  END IF;

  EXECUTE format('SELECT name FROM public.%I WHERE id = $1', v_table)
    INTO v_name USING p_entity_id;

  IF v_name IS NULL THEN
    RAISE EXCEPTION 'Record not found or already deleted';
  END IF;

  FOR r IN SELECT * FROM public.org_master_delete_impact(p_entity_type, p_entity_id) LOOP
    IF r.classification = 'blocking' THEN
      v_blocking := v_blocking || format('%s (%s row(s))%s; ', r.child_table, r.row_count,
        CASE WHEN coalesce(r.via_path, '') <> '' THEN ' via ' || r.via_path ELSE '' END);
    ELSIF r.classification = 'cleanable' THEN
      v_cleanable_count := v_cleanable_count + r.row_count;
    END IF;
  END LOOP;

  IF length(v_blocking) > 0 THEN
    RAISE EXCEPTION 'Cannot delete "%": still referenced by %. Reassign or remove those records first.', v_name, rtrim(v_blocking, '; ');
  END IF;

  IF v_cleanable_count > 0 AND NOT p_cleanup_dependencies THEN
    RAISE EXCEPTION 'Deleting "%" also removes % configuration reference(s). Confirm the cleanup option to proceed.', v_name, v_cleanable_count;
  END IF;

  IF p_cleanup_dependencies THEN
    FOR r IN SELECT * FROM public.org_master_delete_impact(p_entity_type, p_entity_id) LOOP
      IF r.classification = 'cleanable' THEN
        EXECUTE format('DELETE FROM public.%I WHERE %I = $1', r.child_table, r.child_column)
          USING r.target_id;
        v_key := r.child_table || CASE WHEN coalesce(r.via_path, '') <> '' THEN ' (' || r.via_path || ')' ELSE '' END;
        v_cleaned := v_cleaned || jsonb_build_object(v_key,
          jsonb_build_object('rows', r.row_count, 'labels', to_jsonb(r.labels), 'via', r.via_path));
      END IF;
    END LOOP;
  END IF;

  EXECUTE format('DELETE FROM public.%I WHERE id = $1', v_table) USING p_entity_id;

  INSERT INTO public.org_master_delete_audit (entity_type, entity_table, entity_id, entity_name, cleaned, performed_by)
  VALUES (p_entity_type, v_table, p_entity_id, v_name, v_cleaned, auth.uid());

  RETURN jsonb_build_object('deleted', true, 'name', v_name, 'cleaned', v_cleaned);
END;
$fn$;

REVOKE ALL ON FUNCTION public.org_master_delete(text, uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.org_master_delete(text, uuid, boolean) TO authenticated;