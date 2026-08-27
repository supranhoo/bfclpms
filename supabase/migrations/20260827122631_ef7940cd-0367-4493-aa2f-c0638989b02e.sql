
CREATE OR REPLACE FUNCTION public.kpi_period_month_num(p_period text)
RETURNS integer
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE p_period
    WHEN 'January' THEN 1 WHEN 'February' THEN 2 WHEN 'March' THEN 3
    WHEN 'April' THEN 4 WHEN 'May' THEN 5 WHEN 'June' THEN 6
    WHEN 'July' THEN 7 WHEN 'August' THEN 8 WHEN 'September' THEN 9
    WHEN 'October' THEN 10 WHEN 'November' THEN 11 WHEN 'December' THEN 12
    ELSE 0 END;
$$;

-- Preview: per-month counts for a range rename. Read-only.
CREATE OR REPLACE FUNCTION public.correct_kpis_range_dry_run(
  p_category_id uuid,
  p_old_kra text,
  p_old_kpi text,
  p_from_period text,
  p_from_year integer,
  p_to_period text,
  p_to_year integer
)
RETURNS TABLE (
  review_period text,
  review_year integer,
  kpi_rows integer,
  locked_rows integer,
  org_rows integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_from integer := p_from_year * 100 + public.kpi_period_month_num(p_from_period);
  v_to   integer := p_to_year   * 100 + public.kpi_period_month_num(p_to_period);
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin'::app_role)
          OR public.has_role(auth.uid(), 'hr_pms'::app_role)) THEN
    RAISE EXCEPTION 'Only admins or HR PMS can preview KPI name corrections';
  END IF;
  IF v_from < 202605 THEN
    RAISE EXCEPTION 'Cannot correct KPIs before May 2026. Past data is frozen.';
  END IF;
  IF v_to < v_from THEN
    RAISE EXCEPTION 'End month must not be before start month';
  END IF;

  RETURN QUERY
  WITH k AS (
    SELECT kp.review_period, kp.review_year,
           COUNT(*)::int AS n,
           COUNT(*) FILTER (WHERE kp.status IN ('locked','approved_by_manager'))::int AS locked_n
    FROM public.kpis kp
    WHERE kp.category_id = p_category_id
      AND LOWER(TRIM(kp.kra_name)) = LOWER(TRIM(p_old_kra))
      AND LOWER(TRIM(kp.kpi_name)) = LOWER(TRIM(p_old_kpi))
      AND (kp.review_year * 100 + public.kpi_period_month_num(kp.review_period)) BETWEEN v_from AND v_to
    GROUP BY kp.review_period, kp.review_year
  ), o AS (
    SELECT ov.review_period, ov.review_year, COUNT(*)::int AS n
    FROM public.org_kpi_values ov
    WHERE ov.category_id = p_category_id
      AND LOWER(TRIM(ov.kra_name)) = LOWER(TRIM(p_old_kra))
      AND LOWER(TRIM(ov.kpi_name)) = LOWER(TRIM(p_old_kpi))
      AND (ov.review_year * 100 + public.kpi_period_month_num(ov.review_period)) BETWEEN v_from AND v_to
    GROUP BY ov.review_period, ov.review_year
  )
  SELECT COALESCE(k.review_period, o.review_period)::text,
         COALESCE(k.review_year, o.review_year)::int,
         COALESCE(k.n, 0),
         COALESCE(k.locked_n, 0),
         COALESCE(o.n, 0)
  FROM k FULL OUTER JOIN o
    ON k.review_period = o.review_period AND k.review_year = o.review_year
  ORDER BY 2, public.kpi_period_month_num(COALESCE(k.review_period, o.review_period));
END;
$$;

-- Apply: rename across a month range, one reversible action.
CREATE OR REPLACE FUNCTION public.correct_kpis_range(
  p_category_id uuid,
  p_old_kra text,
  p_old_kpi text,
  p_new_kra text,
  p_new_kpi text,
  p_definition_id uuid,
  p_from_period text,
  p_from_year integer,
  p_to_period text,
  p_to_year integer,
  p_include_locked boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_from integer := p_from_year * 100 + public.kpi_period_month_num(p_from_period);
  v_to   integer := p_to_year   * 100 + public.kpi_period_month_num(p_to_period);
  v_kpi_before jsonb;
  v_org_before jsonb;
  v_count integer := 0;
  v_org_count integer := 0;
  v_skipped integer := 0;
  v_action_id uuid;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Only admins can apply KPI name corrections';
  END IF;
  IF v_from < 202605 THEN
    RAISE EXCEPTION 'Cannot correct KPIs before May 2026. Past data is frozen.';
  END IF;
  IF v_to < v_from THEN
    RAISE EXCEPTION 'End month must not be before start month';
  END IF;
  IF COALESCE(TRIM(p_new_kra), '') = '' OR COALESCE(TRIM(p_new_kpi), '') = '' THEN
    RAISE EXCEPTION 'Canonical KRA and KPI names are required';
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', id, 'kra_name', kra_name, 'kpi_name', kpi_name,
           'prev_definition_id', kpi_definition_id)), '[]'::jsonb)
    INTO v_kpi_before
  FROM public.kpis
  WHERE category_id = p_category_id
    AND LOWER(TRIM(kra_name)) = LOWER(TRIM(p_old_kra))
    AND LOWER(TRIM(kpi_name)) = LOWER(TRIM(p_old_kpi))
    AND (review_year * 100 + public.kpi_period_month_num(review_period)) BETWEEN v_from AND v_to
    AND (p_include_locked OR status NOT IN ('locked','approved_by_manager'));

  SELECT COUNT(*)::int INTO v_skipped
  FROM public.kpis
  WHERE category_id = p_category_id
    AND LOWER(TRIM(kra_name)) = LOWER(TRIM(p_old_kra))
    AND LOWER(TRIM(kpi_name)) = LOWER(TRIM(p_old_kpi))
    AND (review_year * 100 + public.kpi_period_month_num(review_period)) BETWEEN v_from AND v_to
    AND NOT (p_include_locked OR status NOT IN ('locked','approved_by_manager'));

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', id, 'kra_name', kra_name, 'kpi_name', kpi_name)), '[]'::jsonb)
    INTO v_org_before
  FROM public.org_kpi_values
  WHERE category_id = p_category_id
    AND LOWER(TRIM(kra_name)) = LOWER(TRIM(p_old_kra))
    AND LOWER(TRIM(kpi_name)) = LOWER(TRIM(p_old_kpi))
    AND (review_year * 100 + public.kpi_period_month_num(review_period)) BETWEEN v_from AND v_to;

  UPDATE public.kpis
  SET kra_name = TRIM(p_new_kra),
      kpi_name = TRIM(p_new_kpi),
      kpi_definition_id = COALESCE(p_definition_id, kpi_definition_id),
      updated_at = now()
  WHERE id IN (SELECT (e->>'id')::uuid FROM jsonb_array_elements(v_kpi_before) e);
  GET DIAGNOSTICS v_count = ROW_COUNT;

  UPDATE public.org_kpi_values
  SET kra_name = TRIM(p_new_kra),
      kpi_name = TRIM(p_new_kpi),
      updated_at = now()
  WHERE id IN (SELECT (e->>'id')::uuid FROM jsonb_array_elements(v_org_before) e);
  GET DIAGNOSTICS v_org_count = ROW_COUNT;

  INSERT INTO public.kpi_standardization_actions
    (action_type, definition_id, category_id, payload, affected_row_count, performed_by)
  VALUES (
    'rename_kpis_range',
    p_definition_id,
    p_category_id,
    jsonb_build_object(
      'old_kra', p_old_kra, 'old_kpi', p_old_kpi,
      'new_kra', TRIM(p_new_kra), 'new_kpi', TRIM(p_new_kpi),
      'from_period', p_from_period, 'from_year', p_from_year,
      'to_period', p_to_period, 'to_year', p_to_year,
      'include_locked', p_include_locked,
      'kpi_rows', v_kpi_before,
      'org_kpi_rows', v_org_before,
      'org_kpi_count', v_org_count,
      'skipped_locked', v_skipped
    ),
    v_count,
    auth.uid()
  )
  RETURNING id INTO v_action_id;

  RETURN jsonb_build_object(
    'ok', true,
    'action_id', v_action_id,
    'kpi_rows_renamed', v_count,
    'org_rows_renamed', v_org_count,
    'skipped_locked', v_skipped
  );
END;
$$;

-- Undo support for both rename flavours, restoring the exact before-image.
CREATE OR REPLACE FUNCTION public.reverse_standardization_action(p_action_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_action public.kpi_standardization_actions%ROWTYPE;
  v_uid uuid := auth.uid();
  v_affected integer := 0;
BEGIN
  IF NOT public.has_role(v_uid, 'admin'::app_role) THEN
    RAISE EXCEPTION 'Only admins can reverse standardization actions';
  END IF;

  SELECT * INTO v_action FROM public.kpi_standardization_actions WHERE id = p_action_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Action not found';
  END IF;
  IF v_action.reversed_at IS NOT NULL THEN
    RAISE EXCEPTION 'Action already reversed';
  END IF;

  IF v_action.action_type = 'create_definition' THEN
    IF EXISTS (SELECT 1 FROM public.kpis WHERE kpi_definition_id = v_action.definition_id) THEN
      RAISE EXCEPTION 'Cannot reverse: KPIs still reference this definition';
    END IF;
    DELETE FROM public.kpi_name_aliases WHERE definition_id = v_action.definition_id;
    DELETE FROM public.kpi_definitions WHERE id = v_action.definition_id;

  ELSIF v_action.action_type = 'link_alias' THEN
    DELETE FROM public.kpi_name_aliases a
    USING jsonb_array_elements(v_action.payload->'aliases') AS al
    WHERE a.definition_id = v_action.definition_id
      AND LOWER(TRIM(a.variant_kra_name)) = LOWER(TRIM(al->>'variant_kra_name'))
      AND LOWER(TRIM(a.variant_kpi_name)) = LOWER(TRIM(al->>'variant_kpi_name'))
      AND a.category_id = (al->>'category_id')::uuid;

  ELSIF v_action.action_type = 'unlink_alias' THEN
    INSERT INTO public.kpi_name_aliases (definition_id, variant_kra_name, variant_kpi_name, category_id)
    SELECT v_action.definition_id, al->>'variant_kra_name', al->>'variant_kpi_name', (al->>'category_id')::uuid
    FROM jsonb_array_elements(v_action.payload->'aliases') AS al
    ON CONFLICT DO NOTHING;

  ELSIF v_action.action_type = 'delete_definition' THEN
    INSERT INTO public.kpi_definitions (id, canonical_kra_name, canonical_kpi_name, category_id)
    SELECT
      (v_action.payload->'definition'->>'id')::uuid,
      v_action.payload->'definition'->>'canonical_kra_name',
      v_action.payload->'definition'->>'canonical_kpi_name',
      (v_action.payload->'definition'->>'category_id')::uuid
    ON CONFLICT (id) DO NOTHING;
    INSERT INTO public.kpi_name_aliases (definition_id, variant_kra_name, variant_kpi_name, category_id)
    SELECT
      (v_action.payload->'definition'->>'id')::uuid,
      al->>'variant_kra_name',
      al->>'variant_kpi_name',
      (al->>'category_id')::uuid
    FROM jsonb_array_elements(COALESCE(v_action.payload->'aliases', '[]'::jsonb)) AS al
    ON CONFLICT DO NOTHING;

  ELSIF v_action.action_type = 'edit_definition' THEN
    UPDATE public.kpi_definitions
    SET canonical_kra_name = v_action.payload->'before'->>'canonical_kra_name',
        canonical_kpi_name = v_action.payload->'before'->>'canonical_kpi_name'
    WHERE id = v_action.definition_id;

  ELSIF v_action.action_type IN ('rename_kpis', 'rename_kpis_range') THEN
    -- Restore each KPI row to its captured name / definition binding.
    UPDATE public.kpis k
    SET kra_name = COALESCE(e->>'kra_name', v_action.payload->>'old_kra'),
        kpi_name = COALESCE(e->>'kpi_name', v_action.payload->>'old_kpi'),
        kpi_definition_id = NULLIF(e->>'prev_definition_id', '')::uuid,
        updated_at = now()
    FROM jsonb_array_elements(COALESCE(v_action.payload->'kpi_rows', '[]'::jsonb)) e
    WHERE k.id = (e->>'id')::uuid;
    GET DIAGNOSTICS v_affected = ROW_COUNT;

    UPDATE public.org_kpi_values o
    SET kra_name = COALESCE(e->>'kra_name', v_action.payload->>'old_kra'),
        kpi_name = COALESCE(e->>'kpi_name', v_action.payload->>'old_kpi'),
        updated_at = now()
    FROM jsonb_array_elements(COALESCE(v_action.payload->'org_kpi_rows', '[]'::jsonb)) e
    WHERE o.id = (e->>'id')::uuid;

  ELSIF v_action.action_type = 'skip_group' THEN
    DELETE FROM public.kpi_scanner_skips
    WHERE category_id   = (v_action.payload->>'category_id')::uuid
      AND normalized_kpi = v_action.payload->>'normalized_kpi';

  ELSIF v_action.action_type = 'unskip_group' THEN
    INSERT INTO public.kpi_scanner_skips (category_id, normalized_kpi, skipped_by, reason)
    VALUES (
      (v_action.payload->>'category_id')::uuid,
      v_action.payload->>'normalized_kpi',
      v_uid,
      v_action.payload->>'reason'
    )
    ON CONFLICT (category_id, normalized_kpi) DO NOTHING;

  ELSE
    RAISE EXCEPTION 'Unknown action_type: %', v_action.action_type;
  END IF;

  UPDATE public.kpi_standardization_actions
  SET reversed_at = now(), reversed_by = v_uid
  WHERE id = p_action_id;

  RETURN jsonb_build_object('ok', true, 'action_type', v_action.action_type, 'affected', v_affected);
END;
$$;

REVOKE ALL ON FUNCTION public.correct_kpis_range_dry_run(uuid, text, text, text, integer, text, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.correct_kpis_range(uuid, text, text, text, text, uuid, text, integer, text, integer, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.correct_kpis_range_dry_run(uuid, text, text, text, integer, text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.correct_kpis_range(uuid, text, text, text, text, uuid, text, integer, text, integer, boolean) TO authenticated;
