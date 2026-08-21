-- ADR-308: Dependency-aware deletion of organisation master records.

-- 1. Configurable registry of dependencies that may be auto-cleaned on delete.
CREATE TABLE IF NOT EXISTS public.org_master_cleanable_dependencies (
  table_name  text PRIMARY KEY,
  reason      text NOT NULL,
  label_sql   text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.org_master_cleanable_dependencies TO authenticated;
GRANT ALL ON public.org_master_cleanable_dependencies TO service_role;
ALTER TABLE public.org_master_cleanable_dependencies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "omcd_admin_all" ON public.org_master_cleanable_dependencies;
CREATE POLICY "omcd_admin_all" ON public.org_master_cleanable_dependencies
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "omcd_read_authenticated" ON public.org_master_cleanable_dependencies;
CREATE POLICY "omcd_read_authenticated" ON public.org_master_cleanable_dependencies
  FOR SELECT TO authenticated USING (true);

INSERT INTO public.org_master_cleanable_dependencies (table_name, reason, label_sql)
VALUES (
  'access_profile_org_scope',
  'Access-profile visibility scope rows are pure configuration; removing an obsolete org master simply drops that scope line.',
  'SELECT coalesce(array_agg(DISTINCT ap.name), ''{}''::text[]) FROM public.access_profile_org_scope s JOIN public.access_profiles ap ON ap.id = s.profile_id WHERE s.%I = %L'
)
ON CONFLICT (table_name) DO UPDATE
  SET reason = EXCLUDED.reason, label_sql = EXCLUDED.label_sql;

-- 2. Immutable audit trail for org master deletions.
CREATE TABLE IF NOT EXISTS public.org_master_delete_audit (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type    text NOT NULL,
  entity_table   text NOT NULL,
  entity_id      uuid NOT NULL,
  entity_name    text,
  cleaned        jsonb NOT NULL DEFAULT '{}'::jsonb,
  performed_by   uuid,
  performed_at   timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.org_master_delete_audit TO authenticated;
GRANT ALL ON public.org_master_delete_audit TO service_role;
ALTER TABLE public.org_master_delete_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "omda_admin_read" ON public.org_master_delete_audit;
CREATE POLICY "omda_admin_read" ON public.org_master_delete_audit
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- 3. entity_type -> table resolver (structural mapping, single source of truth).
CREATE OR REPLACE FUNCTION public.org_master_table(p_entity_type text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE p_entity_type
    WHEN 'division'          THEN 'divisions'
    WHEN 'bu'                THEN 'business_units'
    WHEN 'business-unit'     THEN 'business_units'
    WHEN 'department'        THEN 'departments'
    WHEN 'sub-branch'        THEN 'sub_branches'
    WHEN 'designation'       THEN 'designations'
    WHEN 'pms-grade'         THEN 'pms_grades'
    WHEN 'level'             THEN 'levels'
    WHEN 'location'          THEN 'locations'
    WHEN 'employee-category' THEN 'employee_categories'
    WHEN 'employment-status' THEN 'employment_statuses'
    ELSE NULL
  END
$$;

-- 4. Read-only dependency impact report.
CREATE OR REPLACE FUNCTION public.org_master_delete_impact(p_entity_type text, p_entity_id uuid)
RETURNS TABLE (
  child_table    text,
  child_column   text,
  delete_action  text,
  row_count      bigint,
  classification text,
  labels         text[]
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_table text := public.org_master_table(p_entity_type);
  r record;
  v_count bigint;
  v_labels text[];
  v_class text;
BEGIN
  IF v_table IS NULL THEN
    RAISE EXCEPTION 'Unknown organisation master type: %', p_entity_type;
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
      AND c.confrelid = format('public.%I', v_table)::regclass
      AND array_length(c.conkey, 1) = 1
  LOOP
    EXECUTE format('SELECT count(*) FROM public.%I WHERE %I = $1', r.tbl, r.col)
      INTO v_count USING p_entity_id;

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
        EXECUTE format(r.label_sql, r.col, p_entity_id) INTO v_labels;
      EXCEPTION WHEN others THEN
        v_labels := '{}'::text[];
      END;
    END IF;

    RETURN QUERY SELECT r.tbl, r.col, r.act, v_count, v_class, coalesce(v_labels, '{}'::text[]);
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.org_master_delete_impact(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.org_master_delete_impact(text, uuid) TO authenticated;

-- 5. Guarded delete.
CREATE OR REPLACE FUNCTION public.org_master_delete(
  p_entity_type text,
  p_entity_id uuid,
  p_cleanup_dependencies boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_table text := public.org_master_table(p_entity_type);
  v_name text;
  v_blocking text := '';
  v_cleanable_count bigint := 0;
  v_cleaned jsonb := '{}'::jsonb;
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
      v_blocking := v_blocking || format('%s (%s row(s)); ', r.child_table, r.row_count);
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
        EXECUTE format('DELETE FROM public.%I WHERE %I = $1', r.child_table, r.child_column) USING p_entity_id;
        v_cleaned := v_cleaned || jsonb_build_object(r.child_table, jsonb_build_object('rows', r.row_count, 'labels', to_jsonb(r.labels)));
      END IF;
    END LOOP;
  END IF;

  EXECUTE format('DELETE FROM public.%I WHERE id = $1', v_table) USING p_entity_id;

  INSERT INTO public.org_master_delete_audit (entity_type, entity_table, entity_id, entity_name, cleaned, performed_by)
  VALUES (p_entity_type, v_table, p_entity_id, v_name, v_cleaned, auth.uid());

  RETURN jsonb_build_object('deleted', true, 'name', v_name, 'cleaned', v_cleaned);
END;
$$;

REVOKE ALL ON FUNCTION public.org_master_delete(text, uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.org_master_delete(text, uuid, boolean) TO authenticated;