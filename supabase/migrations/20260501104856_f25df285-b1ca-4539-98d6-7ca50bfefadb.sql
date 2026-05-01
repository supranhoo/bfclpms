-- =============================================================================
-- Phase 5a: Definition split + preview + recent registry audit reader
-- =============================================================================

-- 1. preview_split_definition ------------------------------------------------
CREATE OR REPLACE FUNCTION public.preview_split_definition(
  p_source_id uuid,
  p_move_alias_ids uuid[]
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_source RECORD;
  v_move_count int := 0;
  v_stay_count int := 0;
BEGIN
  IF NOT has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Only administrators can preview split actions';
  END IF;

  SELECT * INTO v_source FROM kpi_definitions WHERE id = p_source_id;
  IF v_source.id IS NULL THEN
    RAISE EXCEPTION 'Source definition % not found', p_source_id;
  END IF;

  -- KPIs currently linked to source; classify by whether their (kra,kpi)
  -- text matches one of the moved aliases.
  WITH linked AS (
    SELECT k.id, k.kra_name, k.kpi_name
    FROM kpis k
    WHERE k.kpi_definition_id = p_source_id
  ), moved AS (
    SELECT a.variant_kra_name, a.variant_kpi_name
    FROM kpi_name_aliases a
    WHERE a.id = ANY(COALESCE(p_move_alias_ids, ARRAY[]::uuid[]))
      AND a.definition_id = p_source_id
  )
  SELECT
    count(*) FILTER (
      WHERE EXISTS (
        SELECT 1 FROM moved m
        WHERE m.variant_kra_name = linked.kra_name
          AND m.variant_kpi_name = linked.kpi_name
      )
    ),
    count(*) FILTER (
      WHERE NOT EXISTS (
        SELECT 1 FROM moved m
        WHERE m.variant_kra_name = linked.kra_name
          AND m.variant_kpi_name = linked.kpi_name
      )
    )
  INTO v_move_count, v_stay_count
  FROM linked;

  RETURN jsonb_build_object(
    'source_id', v_source.id,
    'move_count', COALESCE(v_move_count, 0),
    'stay_count', COALESCE(v_stay_count, 0)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.preview_split_definition(uuid, uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.preview_split_definition(uuid, uuid[]) TO authenticated;

-- 2. split_definition --------------------------------------------------------
CREATE OR REPLACE FUNCTION public.split_definition(
  p_source_id uuid,
  p_keep_alias_ids uuid[],
  p_move_alias_ids uuid[],
  p_new_kra_name text,
  p_new_kpi_name text,
  p_rename_source_kra text DEFAULT NULL,
  p_rename_source_kpi text DEFAULT NULL,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_source RECORD;
  v_new_id uuid;
  v_total_aliases int;
  v_provided_total int;
  v_overlap int;
  v_unknown int;
  v_repointed int := 0;
  v_renamed boolean := false;
  v_old_source_kra text;
  v_old_source_kpi text;
BEGIN
  IF NOT has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Only administrators can split KPI definitions';
  END IF;

  IF p_source_id IS NULL THEN
    RAISE EXCEPTION 'split_definition requires a source definition id';
  END IF;
  IF p_new_kra_name IS NULL OR length(trim(p_new_kra_name)) = 0
     OR p_new_kpi_name IS NULL OR length(trim(p_new_kpi_name)) = 0 THEN
    RAISE EXCEPTION 'New canonical KRA and KPI names are required';
  END IF;
  IF p_move_alias_ids IS NULL OR array_length(p_move_alias_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'At least one alias must move to the new definition';
  END IF;

  -- Lock source row first.
  SELECT * INTO v_source FROM kpi_definitions WHERE id = p_source_id FOR UPDATE;
  IF v_source.id IS NULL THEN
    RAISE EXCEPTION 'Source definition % not found', p_source_id;
  END IF;

  v_old_source_kra := v_source.canonical_kra_name;
  v_old_source_kpi := v_source.canonical_kpi_name;

  -- Lock the affected aliases in deterministic UUID order.
  PERFORM 1
  FROM kpi_name_aliases
  WHERE definition_id = p_source_id
  ORDER BY id
  FOR UPDATE;

  -- Validate alias partition.
  SELECT count(*) INTO v_total_aliases
  FROM kpi_name_aliases WHERE definition_id = p_source_id;

  v_provided_total := COALESCE(array_length(p_keep_alias_ids, 1), 0)
                    + COALESCE(array_length(p_move_alias_ids, 1), 0);
  IF v_provided_total <> v_total_aliases THEN
    RAISE EXCEPTION 'Alias partition incomplete: % provided vs % total on source',
      v_provided_total, v_total_aliases;
  END IF;

  SELECT count(*) INTO v_overlap
  FROM unnest(COALESCE(p_keep_alias_ids, ARRAY[]::uuid[])) k
  JOIN unnest(p_move_alias_ids) m ON m = k;
  IF v_overlap > 0 THEN
    RAISE EXCEPTION 'Alias partition has % overlapping id(s)', v_overlap;
  END IF;

  SELECT count(*) INTO v_unknown
  FROM unnest(p_keep_alias_ids || p_move_alias_ids) ids
  WHERE NOT EXISTS (
    SELECT 1 FROM kpi_name_aliases a
    WHERE a.id = ids AND a.definition_id = p_source_id
  );
  IF v_unknown > 0 THEN
    RAISE EXCEPTION 'Alias partition references % alias(es) not on source', v_unknown;
  END IF;

  -- Insert the new definition. UNIQUE (canonical_kra, canonical_kpi, category)
  -- catches accidental name collisions.
  INSERT INTO kpi_definitions (canonical_kra_name, canonical_kpi_name, category_id)
  VALUES (trim(p_new_kra_name), trim(p_new_kpi_name), v_source.category_id)
  RETURNING id INTO v_new_id;

  -- Re-parent moved aliases.
  UPDATE kpi_name_aliases
     SET definition_id = v_new_id
   WHERE id = ANY(p_move_alias_ids);

  -- Re-point KPI links based on which side the matching alias now belongs to.
  -- The trigger that maintains kpi_definition_id is signature-based, so we
  -- read the post-update mapping straight from kpi_name_aliases.
  WITH rep AS (
    UPDATE kpis k
       SET kpi_definition_id = v_new_id
      FROM kpi_name_aliases a
     WHERE k.kpi_definition_id = p_source_id
       AND a.definition_id = v_new_id
       AND a.category_id = v_source.category_id
       AND a.variant_kra_name = k.kra_name
       AND a.variant_kpi_name = k.kpi_name
    RETURNING 1
  )
  SELECT count(*) INTO v_repointed FROM rep;

  -- Optional rename of the source canonical text.
  IF p_rename_source_kra IS NOT NULL OR p_rename_source_kpi IS NOT NULL THEN
    UPDATE kpi_definitions
       SET canonical_kra_name = COALESCE(NULLIF(trim(p_rename_source_kra), ''), canonical_kra_name),
           canonical_kpi_name = COALESCE(NULLIF(trim(p_rename_source_kpi), ''), canonical_kpi_name),
           updated_at = now()
     WHERE id = p_source_id;
    v_renamed := true;
  END IF;

  -- Audit row.
  INSERT INTO kpi_registry_audit_log(
    action, performed_by, category_id,
    primary_definition_id, affected_definition_id, reason, payload
  ) VALUES (
    'KPI_DEFINITION_SPLIT',
    auth.uid(),
    v_source.category_id,
    p_source_id,
    v_new_id,
    p_reason,
    jsonb_build_object(
      'source_before', jsonb_build_object(
        'id', p_source_id,
        'kra_name', v_old_source_kra,
        'kpi_name', v_old_source_kpi
      ),
      'source_after', jsonb_build_object(
        'id', p_source_id,
        'kra_name', COALESCE(NULLIF(trim(p_rename_source_kra), ''), v_old_source_kra),
        'kpi_name', COALESCE(NULLIF(trim(p_rename_source_kpi), ''), v_old_source_kpi)
      ),
      'new_definition', jsonb_build_object(
        'id', v_new_id,
        'kra_name', trim(p_new_kra_name),
        'kpi_name', trim(p_new_kpi_name)
      ),
      'kept_alias_ids', to_jsonb(COALESCE(p_keep_alias_ids, ARRAY[]::uuid[])),
      'moved_alias_ids', to_jsonb(p_move_alias_ids),
      'repointed_kpis', v_repointed,
      'renamed_source', v_renamed
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'source_id', p_source_id,
    'new_id', v_new_id,
    'moved_aliases', COALESCE(array_length(p_move_alias_ids, 1), 0),
    'kept_aliases', COALESCE(array_length(p_keep_alias_ids, 1), 0),
    'repointed_kpis', v_repointed,
    'renamed_source', v_renamed
  );
END;
$$;

REVOKE ALL ON FUNCTION public.split_definition(uuid, uuid[], uuid[], text, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.split_definition(uuid, uuid[], uuid[], text, text, text, text, text) TO authenticated;

-- 3. get_recent_registry_audit ----------------------------------------------
CREATE OR REPLACE FUNCTION public.get_recent_registry_audit(p_limit int DEFAULT 5)
RETURNS TABLE (
  id uuid,
  action text,
  performed_by uuid,
  performer_name text,
  category_id uuid,
  primary_definition_id uuid,
  affected_definition_id uuid,
  payload jsonb,
  reason text,
  created_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Only administrators can read the registry audit log';
  END IF;

  RETURN QUERY
  SELECT
    l.id,
    l.action,
    l.performed_by,
    p.full_name AS performer_name,
    l.category_id,
    l.primary_definition_id,
    l.affected_definition_id,
    l.payload,
    l.reason,
    l.created_at
  FROM kpi_registry_audit_log l
  LEFT JOIN profiles p ON p.id = l.performed_by
  ORDER BY l.created_at DESC
  LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 5), 50));
END;
$$;

REVOKE ALL ON FUNCTION public.get_recent_registry_audit(int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_recent_registry_audit(int) TO authenticated;