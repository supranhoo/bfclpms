-- v2.66.11.3 — Fix get_reviewer_kpis_for_period type mismatch (drop+recreate)
DROP FUNCTION IF EXISTS public.get_reviewer_kpis_for_period(text, integer);

CREATE FUNCTION public.get_reviewer_kpis_for_period(
  p_period text,
  p_year integer
)
RETURNS TABLE (
  id uuid,
  employee_id uuid,
  category_id uuid,
  kra_name text,
  kpi_name text,
  status text,
  weightage numeric,
  review_period text,
  review_year integer,
  frequency text,
  is_org_level boolean,
  org_level_scope text,
  uom text,
  uom_type text,
  criteria text,
  target_value numeric,
  r5 text,
  r4 text,
  r3 text,
  r2 text,
  r1 text,
  r0 text,
  sub_frequency text,
  frequency_cycle_start text,
  source_template_id uuid,
  threshold_mode text,
  source_of_data text,
  qualitative_options jsonb,
  is_issued boolean,
  ref_code text,
  is_frequency_locked boolean,
  require_resubmit_reason boolean,
  day_count_type text,
  created_at timestamptz,
  updated_at timestamptz
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
      SELECT k.id, k.employee_id, k.category_id, k.kra_name, k.kpi_name,
             k.status::text,
             k.weightage, k.review_period, k.review_year, k.frequency, k.is_org_level,
             k.org_level_scope::text, k.uom, k.uom_type::text, k.criteria, k.target_value,
             k.r5::text, k.r4::text, k.r3::text, k.r2::text, k.r1::text, k.r0::text,
             k.sub_frequency, k.frequency_cycle_start::text,
             k.source_template_id, k.threshold_mode::text, k.source_of_data, k.qualitative_options,
             k.is_issued, k.ref_code, k.is_frequency_locked, k.require_resubmit_reason,
             k.day_count_type::text, k.created_at, k.updated_at
      FROM public.kpis k
      WHERE k.review_period = p_period AND k.review_year = p_year
      ORDER BY k.created_at DESC;
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
      SELECT k.id, k.employee_id, k.category_id, k.kra_name, k.kpi_name,
             k.status::text,
             k.weightage, k.review_period, k.review_year, k.frequency, k.is_org_level,
             k.org_level_scope::text, k.uom, k.uom_type::text, k.criteria, k.target_value,
             k.r5::text, k.r4::text, k.r3::text, k.r2::text, k.r1::text, k.r0::text,
             k.sub_frequency, k.frequency_cycle_start::text,
             k.source_template_id, k.threshold_mode::text, k.source_of_data, k.qualitative_options,
             k.is_issued, k.ref_code, k.is_frequency_locked, k.require_resubmit_reason,
             k.day_count_type::text, k.created_at, k.updated_at
      FROM public.kpis k
      WHERE k.review_period = p_period AND k.review_year = p_year
        AND k.employee_id IN (SELECT id FROM visible)
      ORDER BY k.created_at DESC;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_reviewer_kpis_for_period(text, integer) TO authenticated;