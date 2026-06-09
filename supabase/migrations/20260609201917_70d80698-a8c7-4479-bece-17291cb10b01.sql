
-- ADR-083: Dashboard aggregate RPCs to eliminate full-table client scans.

-- 1) Admin dashboard: single-trip aggregate counts.
CREATE OR REPLACE FUNCTION public.get_admin_dashboard_stats()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total_employees int;
  v_open_queries int;
  v_pending_rollbacks int;
  v_locked_periods int;
  v_active_periods int;
  v_stage_counts jsonb;
BEGIN
  SELECT count(*) INTO v_total_employees FROM public.profiles;
  SELECT count(*) INTO v_open_queries
    FROM public.kpi_queries
    WHERE status = 'open' AND query_type = 'query';
  SELECT count(*) INTO v_pending_rollbacks
    FROM public.kpi_rollback_requests WHERE status = 'pending';

  SELECT
    count(*) FILTER (WHERE is_locked) ,
    count(*) FILTER (WHERE NOT is_locked)
  INTO v_locked_periods, v_active_periods
  FROM public.review_periods;

  SELECT coalesce(jsonb_object_agg(stage, c), '{}'::jsonb) INTO v_stage_counts
  FROM (
    SELECT coalesce(status, 'kra_set') AS stage, count(*) AS c
    FROM public.kpis
    GROUP BY 1
  ) s;

  RETURN jsonb_build_object(
    'total_employees', v_total_employees,
    'open_queries', v_open_queries,
    'pending_rollbacks', v_pending_rollbacks,
    'locked_periods', v_locked_periods,
    'active_periods', v_active_periods,
    'stage_counts', v_stage_counts
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_admin_dashboard_stats() TO authenticated, service_role;

-- 2) Management dashboard: flat join (kpis ⨝ review_submissions) for fiscal range.
--    Returns minimal columns; client retains the existing aggregator (preserves
--    getKpiDueDate semantics and avoids parity risk). Replaces PostgREST embed
--    + N batched .range() loops with one planned query.
CREATE OR REPLACE FUNCTION public.get_management_dashboard_rows(
  p_year int,
  p_months text[],
  p_employee_ids uuid[] DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  employee_id uuid,
  status text,
  weightage numeric,
  review_period text,
  review_year int,
  frequency text,
  final_score numeric,
  management_score numeric,
  auditor_score numeric,
  hr_pms_score numeric,
  skip_level_score numeric,
  manager_score numeric,
  self_score numeric,
  is_na boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    k.id, k.employee_id, k.status, k.weightage, k.review_period,
    k.review_year, k.frequency,
    rs.final_score, rs.management_score, rs.auditor_score, rs.hr_pms_score,
    rs.skip_level_score, rs.manager_score, rs.self_score, rs.is_na
  FROM public.kpis k
  LEFT JOIN public.review_submissions rs ON rs.kpi_id = k.id
  WHERE k.review_year = p_year
    AND k.review_period = ANY(p_months)
    AND (p_employee_ids IS NULL OR k.employee_id = ANY(p_employee_ids));
$$;

GRANT EXECUTE ON FUNCTION public.get_management_dashboard_rows(int, text[], uuid[]) TO authenticated, service_role;
