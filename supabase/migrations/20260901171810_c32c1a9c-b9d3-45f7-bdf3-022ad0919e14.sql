-- ADR-338 — KPI rename lock predicate must use the review_status vocabulary.
-- kpis.status is of enum type review_status; the previous bodies compared it to
-- 'locked'/'approved_by_manager' (values of kpi_status), which raises at runtime.
-- Canonical lock rule (same as bu_console_group_edit_definition):
--   locked = final score exists OR status has moved past 'kra_set'.

CREATE OR REPLACE FUNCTION public.preview_kpi_range_correction(
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
           COUNT(*) FILTER (
             WHERE rs.final_score IS NOT NULL OR kp.status::text <> 'kra_set'
           )::int AS locked_n
    FROM public.kpis kp
    LEFT JOIN public.review_submissions rs ON rs.kpi_id = kp.id
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

  WITH scoped AS (
    SELECT k.id, k.kra_name, k.kpi_name, k.kpi_definition_id,
           (rs.final_score IS NOT NULL OR k.status::text <> 'kra_set') AS is_locked
    FROM public.kpis k
    LEFT JOIN public.review_submissions rs ON rs.kpi_id = k.id
    WHERE k.category_id = p_category_id
      AND LOWER(TRIM(k.kra_name)) = LOWER(TRIM(p_old_kra))
      AND LOWER(TRIM(k.kpi_name)) = LOWER(TRIM(p_old_kpi))
      AND (k.review_year * 100 + public.kpi_period_month_num(k.review_period)) BETWEEN v_from AND v_to
  )
  SELECT
    COALESCE(jsonb_agg(jsonb_build_object(
      'id', id, 'kra_name', kra_name, 'kpi_name', kpi_name,
      'prev_definition_id', kpi_definition_id))
      FILTER (WHERE p_include_locked OR NOT is_locked), '[]'::jsonb),
    COUNT(*) FILTER (WHERE NOT p_include_locked AND is_locked)::int
  INTO v_kpi_before, v_skipped
  FROM scoped;

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