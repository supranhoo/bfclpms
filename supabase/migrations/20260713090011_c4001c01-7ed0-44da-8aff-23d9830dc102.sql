CREATE OR REPLACE FUNCTION public.get_monthly_trend(
  p_from_year int,
  p_from_month text,
  p_to_year int,
  p_to_month text,
  p_include_inactive boolean DEFAULT false
)
RETURNS TABLE (
  employee_id uuid,
  full_name text,
  employee_code text,
  designation text,
  department_id uuid,
  department_name text,
  business_unit_id uuid,
  business_unit_name text,
  reporting_manager_id uuid,
  reporting_manager_label text,
  is_active boolean,
  review_year int,
  review_period text,
  weighted_score numeric,
  final_only_score numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_month_order jsonb := '{
    "January":1,"February":2,"March":3,"April":4,"May":5,"June":6,
    "July":7,"August":8,"September":9,"October":10,"November":11,"December":12
  }'::jsonb;
  v_from_ord int;
  v_to_ord int;
BEGIN
  -- Access gate: mirror the report page's role gate.
  IF NOT (
    has_role(v_uid, 'admin'::app_role)
    OR has_role(v_uid, 'hr_pms'::app_role)
    OR has_role(v_uid, 'management'::app_role)
  ) THEN
    RETURN;
  END IF;

  v_from_ord := (v_month_order ->> p_from_month)::int;
  v_to_ord   := (v_month_order ->> p_to_month)::int;
  IF v_from_ord IS NULL OR v_to_ord IS NULL THEN
    RAISE EXCEPTION 'get_monthly_trend: invalid month name (from=%, to=%)', p_from_month, p_to_month;
  END IF;

  RETURN QUERY
  WITH agg AS (
    SELECT
      k.employee_id                                            AS emp_id,
      k.review_year                                            AS ry,
      k.review_period                                          AS rp,
      SUM(
        COALESCE(rs.final_score, rs.management_score, rs.auditor_score,
                 rs.hr_pms_score, rs.skip_level_score, rs.manager_score,
                 rs.self_score) * k.weightage
      ) FILTER (
        WHERE rs.is_na = false
          AND COALESCE(k.weightage, 0) > 0
          AND COALESCE(rs.final_score, rs.management_score, rs.auditor_score,
                       rs.hr_pms_score, rs.skip_level_score, rs.manager_score,
                       rs.self_score) IS NOT NULL
      )                                                         AS sum_weighted,
      SUM(k.weightage) FILTER (
        WHERE rs.is_na = false
          AND COALESCE(k.weightage, 0) > 0
          AND COALESCE(rs.final_score, rs.management_score, rs.auditor_score,
                       rs.hr_pms_score, rs.skip_level_score, rs.manager_score,
                       rs.self_score) IS NOT NULL
      )                                                         AS sum_weight,
      SUM(rs.final_score * k.weightage) FILTER (
        WHERE rs.is_na = false
          AND COALESCE(k.weightage, 0) > 0
          AND rs.final_score IS NOT NULL
      )                                                         AS sum_final_weighted,
      SUM(k.weightage) FILTER (
        WHERE rs.is_na = false
          AND COALESCE(k.weightage, 0) > 0
          AND rs.final_score IS NOT NULL
      )                                                         AS sum_final_weight
    FROM kpis k
    LEFT JOIN review_submissions rs ON rs.kpi_id = k.id
    WHERE
      -- Month-range filter expressed as (year, month_ordinal) tuple compare
      (k.review_year * 100 + (v_month_order ->> k.review_period)::int)
        BETWEEN (p_from_year * 100 + v_from_ord)
            AND (p_to_year   * 100 + v_to_ord)
    GROUP BY k.employee_id, k.review_year, k.review_period
  )
  SELECT
    p.id                                              AS employee_id,
    COALESCE(p.full_name, 'Unknown')                  AS full_name,
    COALESCE(p.employee_code, '')                     AS employee_code,
    COALESCE(p.designation, '')                       AS designation,
    p.department_id,
    COALESCE(d.name, '')                              AS department_name,
    d.business_unit_id                                AS business_unit_id,
    COALESCE(bu.name, '')                             AS business_unit_name,
    p.reporting_manager_id,
    CASE
      WHEN mgr.id IS NULL THEN NULL
      WHEN COALESCE(mgr.employee_code, '') = '' THEN mgr.full_name
      ELSE mgr.full_name || '(' || mgr.employee_code || ')'
    END                                               AS reporting_manager_label,
    COALESCE(p.is_active, true)                       AS is_active,
    agg.ry                                            AS review_year,
    agg.rp                                            AS review_period,
    CASE WHEN agg.sum_weight IS NULL OR agg.sum_weight = 0 THEN NULL
         ELSE ROUND(agg.sum_weighted / agg.sum_weight, 2) END       AS weighted_score,
    CASE WHEN agg.sum_final_weight IS NULL OR agg.sum_final_weight = 0 THEN NULL
         ELSE ROUND(agg.sum_final_weighted / agg.sum_final_weight, 2) END AS final_only_score
  FROM agg
  JOIN profiles p ON p.id = agg.emp_id
  LEFT JOIN departments d ON d.id = p.department_id
  LEFT JOIN business_units bu ON bu.id = d.business_unit_id
  LEFT JOIN profiles mgr ON mgr.id = p.reporting_manager_id
  WHERE (p_include_inactive OR COALESCE(p.is_active, true) = true);
END;
$$;

REVOKE ALL ON FUNCTION public.get_monthly_trend(int, text, int, text, boolean) FROM public;
GRANT EXECUTE ON FUNCTION public.get_monthly_trend(int, text, int, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_monthly_trend(int, text, int, text, boolean) TO service_role;

COMMENT ON FUNCTION public.get_monthly_trend(int, text, int, text, boolean) IS
  'Aggregates per-employee monthly weighted scores for the Monthly Scorecard Trend report. Business unit metadata is derived from departments.business_unit_id. Restricted to admin/hr_pms/management (returns empty otherwise).';