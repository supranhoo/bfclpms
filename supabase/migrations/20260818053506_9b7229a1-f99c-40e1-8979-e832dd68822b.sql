-- Finding 1: pg_trgm lives in the `extensions` schema; these SECURITY DEFINER
-- functions pinned search_path to 'public' only, hiding similarity().
ALTER FUNCTION public.suggest_definition_merges(numeric, integer) SET search_path TO 'public', 'extensions';
ALTER FUNCTION public.suggest_alias_candidates(numeric, integer) SET search_path TO 'public', 'extensions';

-- Finding 6: Monthly Scorecard trend returned zero rows for manager / auditor /
-- skip-level callers even though the report is exposed to them. Widen the gate
-- and scope the rows instead of returning nothing.
CREATE OR REPLACE FUNCTION public.get_monthly_trend(p_from_year integer, p_from_month text, p_to_year integer, p_to_month text, p_include_inactive boolean DEFAULT false)
 RETURNS TABLE(employee_id uuid, full_name text, employee_code text, designation text, department_id uuid, department_name text, business_unit_id uuid, business_unit_name text, reporting_manager_id uuid, reporting_manager_label text, is_active boolean, review_year integer, review_period text, weighted_score numeric, final_only_score numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_global boolean;
  v_auditor boolean;
  v_scoped boolean;
  v_month_order jsonb := '{
    "January":1,"February":2,"March":3,"April":4,"May":5,"June":6,
    "July":7,"August":8,"September":9,"October":10,"November":11,"December":12
  }'::jsonb;
  v_from_ord int;
  v_to_ord int;
BEGIN
  IF v_uid IS NULL THEN
    RETURN;
  END IF;

  v_global := has_role(v_uid, 'admin'::app_role)
           OR has_role(v_uid, 'hr_pms'::app_role)
           OR has_role(v_uid, 'management'::app_role);
  v_auditor := has_role(v_uid, 'auditor'::app_role);
  v_scoped := has_role(v_uid, 'manager'::app_role)
           OR has_role(v_uid, 'skip_level'::app_role);

  IF NOT (v_global OR v_auditor OR v_scoped) THEN
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
  WHERE (p_include_inactive OR COALESCE(p.is_active, true) = true)
    AND (
      v_global
      OR p.id = v_uid
      OR p.reporting_manager_id = v_uid
      OR p.functional_manager_id = v_uid
      OR EXISTS (
        SELECT 1 FROM profiles m
         WHERE m.id = p.reporting_manager_id AND m.reporting_manager_id = v_uid
      )
      OR (v_auditor AND EXISTS (
        SELECT 1 FROM audit_kpi_assignments a
         WHERE a.employee_id = p.id AND a.auditor_id = v_uid
      ))
    );
END;
$function$;