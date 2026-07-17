CREATE OR REPLACE FUNCTION public.can_proxy_submit_annual_review(_instance_id uuid, _proxy_user_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_enabled boolean;
  v_employee_id uuid;
  v_manager_id uuid;
  v_skip_id uuid;
  v_status text;
  v_employee_email text;
  v_employee_last_signin timestamptz;
  v_designated uuid;
  v_emp_bu uuid;
  v_emp_dept uuid;
  v_access jsonb;
  v_scope text;
  v_access_bu uuid;
BEGIN
  IF _proxy_user_id IS NULL OR _instance_id IS NULL THEN
    RETURN false;
  END IF;

  IF auth.uid() IS DISTINCT FROM _proxy_user_id THEN
    RETURN false;
  END IF;

  SELECT assisted_self_submission_enabled INTO v_enabled FROM public.app_settings LIMIT 1;
  IF NOT COALESCE(v_enabled, false) THEN
    RETURN false;
  END IF;

  SELECT i.employee_id, i.manager_id, i.skip_id, i.overall_status::text, d.business_unit_id, p.department_id
    INTO v_employee_id, v_manager_id, v_skip_id, v_status, v_emp_bu, v_emp_dept
  FROM public.annual_review_instances i
  LEFT JOIN public.profiles p ON p.id = i.employee_id
  LEFT JOIN public.departments d ON d.id = p.department_id
  WHERE i.id = _instance_id;

  IF v_employee_id IS NULL OR v_status <> 'pending_self' THEN
    RETURN false;
  END IF;

  SELECT p.email, u.last_sign_in_at, p.designated_proxy_user_id
    INTO v_employee_email, v_employee_last_signin, v_designated
  FROM public.profiles p
  LEFT JOIN auth.users u ON u.id = p.id
  WHERE p.id = v_employee_id;

  IF v_employee_email IS NOT NULL AND v_employee_last_signin IS NOT NULL THEN
    RETURN false;
  END IF;

  IF _proxy_user_id = v_manager_id
     OR _proxy_user_id = v_skip_id
     OR _proxy_user_id = v_designated
     OR public.has_role(_proxy_user_id, 'admin'::app_role)
     OR public.has_role(_proxy_user_id, 'hr_pms'::app_role) THEN
    RETURN true;
  END IF;

  -- Direct head of the employee's department (handles multi-department HODs).
  IF v_emp_dept IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.departments
     WHERE head_user_id = _proxy_user_id
       AND id = v_emp_dept
  ) THEN
    RETURN true;
  END IF;

  -- Direct head of the employee's business unit, or head of any department in that BU.
  IF v_emp_bu IS NOT NULL AND (
    EXISTS (SELECT 1 FROM public.business_units WHERE id = v_emp_bu AND head_user_id = _proxy_user_id)
    OR EXISTS (SELECT 1 FROM public.departments  WHERE business_unit_id = v_emp_bu AND head_user_id = _proxy_user_id)
  ) THEN
    RETURN true;
  END IF;

  v_access := public.annual_review_directory_access(_proxy_user_id);
  IF COALESCE((v_access->>'can_access')::boolean, false) THEN
    v_scope := v_access->>'scope';
    v_access_bu := NULLIF(v_access->>'business_unit_id','')::uuid;

    IF v_scope = 'all' THEN
      RETURN true;
    END IF;

    IF v_scope = 'bu' AND v_access_bu IS NOT NULL AND v_emp_bu = v_access_bu THEN
      RETURN true;
    END IF;
  END IF;

  RETURN false;
END;
$function$;