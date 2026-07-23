
-- ADR-139: Instance-scoped Carry-KRA reader.
-- Returns the KPI + review_submission rows used by the Carry KRA snapshot for
-- an employee, but only to callers legitimately on that annual review's chain.
CREATE OR REPLACE FUNCTION public.get_annual_review_carry_kra_rows(
  p_instance_id uuid,
  p_fy_start    int
)
RETURNS TABLE(
  kpi_id         uuid,
  review_period  text,
  review_year    int,
  weightage      numeric,
  is_na          boolean,
  final_score    numeric,
  manager_score  numeric,
  auditor_score  numeric,
  self_score     numeric
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid  uuid := auth.uid();
  v_inst public.annual_review_instances%ROWTYPE;
  v_ok   boolean := false;
BEGIN
  IF v_uid IS NULL OR p_instance_id IS NULL THEN
    RAISE EXCEPTION 'permission denied' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_inst FROM public.annual_review_instances WHERE id = p_instance_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'permission denied' USING ERRCODE = '42501';
  END IF;

  -- Authorised audience (read-only): any named reviewer on the instance, the
  -- employee themselves, admin/hr_pms/management, or a user with assistance
  -- access under the existing annual-review directory rules.
  IF public.has_role(v_uid, 'admin')
     OR public.has_role(v_uid, 'hr_pms')
     OR public.has_role(v_uid, 'management')
     OR v_inst.employee_id  = v_uid
     OR v_inst.manager_id   = v_uid
     OR v_inst.skip_id      = v_uid
     OR v_inst.dept_head_id = v_uid
     OR v_inst.bu_head_id   = v_uid
     OR v_inst.hr_id        = v_uid
     OR v_inst.management_id = v_uid
     OR public.can_access_annual_review_instance_for_assistance(p_instance_id)
  THEN
    v_ok := true;
  END IF;

  IF NOT v_ok THEN
    RAISE EXCEPTION 'permission denied' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT k.id,
         k.review_period,
         k.review_year,
         k.weightage,
         rs.is_na,
         rs.final_score,
         rs.manager_score,
         rs.auditor_score,
         rs.self_score
    FROM public.kpis k
    LEFT JOIN public.review_submissions rs ON rs.kpi_id = k.id
   WHERE k.employee_id = v_inst.employee_id
     AND k.review_year IN (p_fy_start, p_fy_start + 1);
END;
$$;

REVOKE ALL ON FUNCTION public.get_annual_review_carry_kra_rows(uuid, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_annual_review_carry_kra_rows(uuid, int) TO authenticated, service_role;
