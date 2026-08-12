DROP FUNCTION IF EXISTS public.tni_qualified_kpis(jsonb, numeric, integer);

CREATE FUNCTION public.tni_qualified_kpis(
  p_periods jsonb,
  p_threshold numeric,
  p_min_scored_months integer DEFAULT 1
)
RETURNS TABLE(
  employee_id uuid,
  kpi_key text,
  kra_name text,
  kpi_name text,
  weightage numeric,
  months jsonb,
  scored_months integer,
  worst_score numeric,
  latest_score numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_can_view boolean := false;
  v_full_scope boolean := false;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  SELECT
    EXISTS (
      SELECT 1
      FROM public.report_access_config c
      WHERE c.report_key = 'tni'
        AND EXISTS (
          SELECT 1
          FROM public.user_roles ur
          WHERE ur.user_id = v_uid
            AND ur.role = ANY(c.view_roles)
        )
    )
    OR EXISTS (
      SELECT 1
      FROM public.report_access_user_overrides o
      WHERE o.report_key = 'tni'
        AND o.user_id = v_uid
        AND o.can_view = true
    )
  INTO v_can_view;

  IF NOT v_can_view THEN
    RAISE EXCEPTION 'Not authorized to view the TNI report' USING ERRCODE = '42501';
  END IF;

  v_full_scope :=
    public.has_role(v_uid, 'admin'::public.app_role)
    OR public.has_role(v_uid, 'management'::public.app_role)
    OR public.has_role(v_uid, 'hr_pms'::public.app_role)
    OR public.has_role(v_uid, 'auditor'::public.app_role);

  RETURN QUERY
  WITH periods AS (
    SELECT (e->>'month')::text AS review_period,
           (e->>'year')::int AS review_year,
           t.ordinality AS ord
    FROM jsonb_array_elements(COALESCE(p_periods, '[]'::jsonb))
      WITH ORDINALITY AS t(e, ordinality)
  ),
  scored AS (
    SELECT k.id AS kpi_id,
           k.employee_id,
           lower(btrim(COALESCE(k.kra_name, ''))) || '||' || lower(btrim(COALESCE(k.kpi_name, ''))) AS normalized_kpi_key,
           k.kra_name,
           k.kpi_name,
           k.weightage,
           k.review_period,
           k.review_year,
           p.ord,
           COALESCE(
             rs.final_score,
             rs.management_score,
             rs.hr_pms_score,
             rs.skip_level_score,
             rs.auditor_score,
             rs.functional_manager_score,
             rs.manager_score,
             rs.self_score
           ) AS eff_score
    FROM periods p
    JOIN public.kpis k
      ON k.review_period = p.review_period
     AND k.review_year = p.review_year
    JOIN public.review_submissions rs ON rs.kpi_id = k.id
    WHERE COALESCE(rs.is_na, false) = false
      AND COALESCE(
            rs.final_score,
            rs.management_score,
            rs.hr_pms_score,
            rs.skip_level_score,
            rs.auditor_score,
            rs.functional_manager_score,
            rs.manager_score,
            rs.self_score
          ) IS NOT NULL
      AND k.employee_id IS NOT NULL
      AND (
        v_full_scope
        OR public.can_view_kpi_row(
          k.id,
          k.employee_id,
          k.is_org_level,
          k.category_id,
          k.kra_name,
          k.kpi_name
        )
      )
  )
  SELECT s.employee_id,
         s.normalized_kpi_key,
         (array_agg(s.kra_name ORDER BY s.ord DESC))[1],
         (array_agg(s.kpi_name ORDER BY s.ord DESC))[1],
         (array_agg(s.weightage ORDER BY s.ord DESC))[1],
         jsonb_agg(
           jsonb_build_object(
             'month', s.review_period,
             'year', s.review_year,
             'score', s.eff_score
           ) ORDER BY s.ord
         ),
         count(*)::int,
         min(s.eff_score),
         (array_agg(s.eff_score ORDER BY s.ord DESC))[1]
  FROM scored s
  GROUP BY s.employee_id, s.normalized_kpi_key
  HAVING bool_and(s.eff_score <= p_threshold)
     AND count(*) >= greatest(1, COALESCE(p_min_scored_months, 1));
END;
$function$;

REVOKE ALL ON FUNCTION public.tni_qualified_kpis(jsonb, numeric, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tni_qualified_kpis(jsonb, numeric, integer) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.detect_training_needs_for_period(
  p_review_period text,
  p_review_year integer,
  p_threshold numeric DEFAULT 3.0
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_compliance integer := 0;
  v_skill integer := 0;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Only Admin can create TNI action records' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.training_needs (
    employee_id, kpi_id, category_id, review_period, review_year,
    score, gap_type, priority, status, training_recommendation, identified_by
  )
  SELECT
    k.employee_id, k.id, k.category_id, k.review_period, k.review_year,
    rs.final_score,
    'compliance'::public.tni_gap_type,
    'high'::public.tni_priority,
    'identified'::public.tni_status,
    'Auto-flagged: non-submission / compliance penalty. No training required.',
    auth.uid()
  FROM public.kpis k
  JOIN public.review_submissions rs ON rs.kpi_id = k.id
  WHERE k.review_period = p_review_period
    AND k.review_year = p_review_year
    AND k.status = 'approved'
    AND rs.final_score IS NOT NULL
    AND rs.final_score < p_threshold
    AND (rs.self_score IS NULL OR rs.auto_advance_reason IS NOT NULL)
    AND NOT EXISTS (
      SELECT 1 FROM public.training_needs tn WHERE tn.kpi_id = k.id
    );
  GET DIAGNOSTICS v_compliance = ROW_COUNT;

  INSERT INTO public.training_needs (
    employee_id, kpi_id, category_id, review_period, review_year,
    score, gap_type, priority, status, identified_by
  )
  SELECT
    k.employee_id, k.id, k.category_id, k.review_period, k.review_year,
    rs.final_score,
    'skill'::public.tni_gap_type,
    CASE
      WHEN rs.final_score < 2.0 THEN 'high'::public.tni_priority
      WHEN rs.final_score < 2.5 THEN 'medium'::public.tni_priority
      ELSE 'low'::public.tni_priority
    END,
    'identified'::public.tni_status,
    auth.uid()
  FROM public.kpis k
  JOIN public.review_submissions rs ON rs.kpi_id = k.id
  WHERE k.review_period = p_review_period
    AND k.review_year = p_review_year
    AND k.status = 'approved'
    AND rs.final_score IS NOT NULL
    AND rs.final_score < p_threshold
    AND rs.self_score IS NOT NULL
    AND rs.auto_advance_reason IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.training_needs tn WHERE tn.kpi_id = k.id
    );
  GET DIAGNOSTICS v_skill = ROW_COUNT;

  RETURN v_compliance + v_skill;
END;
$function$;

REVOKE ALL ON FUNCTION public.detect_training_needs_for_period(text, integer, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.detect_training_needs_for_period(text, integer, numeric) TO authenticated, service_role;