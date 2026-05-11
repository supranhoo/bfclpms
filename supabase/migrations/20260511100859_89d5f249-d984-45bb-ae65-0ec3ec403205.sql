-- v2.66.11.2 — Reviewer dashboard submission-score signature RPC
-- Returns slim review_submissions rows for a (period, year), joined to KPIs server-side,
-- so reviewer dashboards (HR PMS, Audit, Management) can fetch score signatures in one
-- call instead of N batched client-side IN(...) queries that were timing out under load.

CREATE OR REPLACE FUNCTION public.get_reviewer_submission_scores_for_period(
  p_period text,
  p_year integer
)
RETURNS TABLE (
  kpi_id uuid,
  manager_score numeric,
  skip_level_score numeric,
  hr_pms_score numeric,
  auditor_score numeric,
  management_score numeric,
  final_score numeric,
  is_na boolean,
  self_score numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_is_full boolean;
BEGIN
  PERFORM set_config('statement_timeout', '30000', true);

  IF v_uid IS NULL OR p_period IS NULL OR p_year IS NULL THEN
    RETURN;
  END IF;

  v_is_full := has_role(v_uid, 'admin'::app_role)
    OR has_role(v_uid, 'auditor'::app_role)
    OR has_role(v_uid, 'hr_pms'::app_role)
    OR has_role(v_uid, 'management'::app_role)
    OR has_report_access_override(v_uid);

  IF v_is_full THEN
    RETURN QUERY
      SELECT rs.kpi_id, rs.manager_score, rs.skip_level_score, rs.hr_pms_score,
             rs.auditor_score, rs.management_score, rs.final_score, rs.is_na, rs.self_score
      FROM public.review_submissions rs
      JOIN public.kpis k ON k.id = rs.kpi_id
      WHERE k.review_period = p_period AND k.review_year = p_year;
  ELSE
    RETURN QUERY
      WITH directs AS (
        SELECT id FROM public.profiles WHERE is_active = true AND reporting_manager_id = v_uid
      ),
      indirects AS (
        SELECT id FROM public.profiles WHERE is_active = true
          AND reporting_manager_id IN (SELECT id FROM directs)
      ),
      visible AS (
        SELECT v_uid AS id
        UNION SELECT id FROM directs
        UNION SELECT id FROM indirects
      )
      SELECT rs.kpi_id, rs.manager_score, rs.skip_level_score, rs.hr_pms_score,
             rs.auditor_score, rs.management_score, rs.final_score, rs.is_na, rs.self_score
      FROM public.review_submissions rs
      JOIN public.kpis k ON k.id = rs.kpi_id
      WHERE k.review_period = p_period AND k.review_year = p_year
        AND k.employee_id IN (SELECT id FROM visible);
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_reviewer_submission_scores_for_period(text, integer) TO authenticated;