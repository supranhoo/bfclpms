
CREATE OR REPLACE FUNCTION public.ar_expected_reviewer_slots(p_instance_id uuid)
RETURNS TABLE (slot text, expected_user_id uuid)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_emp uuid; v_dept uuid; v_bu uuid; v_company uuid; v_mgr uuid;
BEGIN
  SELECT i.employee_id, p.department_id, d.business_unit_id, p.company_id, p.reporting_manager_id
    INTO v_emp, v_dept, v_bu, v_company, v_mgr
    FROM public.annual_review_instances i
    JOIN public.profiles p ON p.id = i.employee_id
    LEFT JOIN public.departments d ON d.id = p.department_id
   WHERE i.id = p_instance_id;

  IF v_emp IS NULL THEN RETURN; END IF;

  slot := 'manager';   expected_user_id := v_mgr;                                                       RETURN NEXT;
  slot := 'skip';      expected_user_id := (SELECT reporting_manager_id FROM public.profiles WHERE id = v_mgr); RETURN NEXT;
  slot := 'dept_head'; expected_user_id := (SELECT head_user_id FROM public.departments WHERE id = v_dept);     RETURN NEXT;
  slot := 'bu_head';   expected_user_id := (SELECT head_user_id FROM public.business_units WHERE id = v_bu);    RETURN NEXT;
  slot := 'hr';        expected_user_id := (SELECT hr_head_user_id FROM public.org_head_config WHERE company_id = v_company); RETURN NEXT;
  RETURN;
END $$;

REVOKE ALL ON FUNCTION public.ar_expected_reviewer_slots(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ar_expected_reviewer_slots(uuid) TO authenticated, service_role;
