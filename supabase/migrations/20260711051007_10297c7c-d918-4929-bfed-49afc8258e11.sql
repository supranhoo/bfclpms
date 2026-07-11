CREATE OR REPLACE FUNCTION public.can_access_annual_review_instance_for_assistance(p_instance_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_access jsonb;
  v_scope text;
  v_access_bu uuid;
  v_emp_bu uuid;
BEGIN
  IF auth.uid() IS NULL OR p_instance_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT d.business_unit_id
    INTO v_emp_bu
  FROM public.annual_review_instances i
  LEFT JOIN public.profiles p ON p.id = i.employee_id
  LEFT JOIN public.departments d ON d.id = p.department_id
  WHERE i.id = p_instance_id;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  v_access := public.annual_review_directory_access(auth.uid());
  IF NOT COALESCE((v_access->>'can_access')::boolean, false) THEN
    RETURN false;
  END IF;

  v_scope := v_access->>'scope';
  v_access_bu := NULLIF(v_access->>'business_unit_id','')::uuid;

  -- HR-team (scope='all') can VIEW instances at every stage (read-only widening).
  -- Write policies (instances_stage_update, response RLS, submit RPCs) remain
  -- gated to assigned reviewers or admin/hr_pms, so no approval rights leak.
  IF v_scope = 'all' THEN
    RETURN true;
  END IF;

  IF v_scope = 'bu' AND v_access_bu IS NOT NULL AND v_emp_bu = v_access_bu THEN
    RETURN true;
  END IF;

  RETURN false;
END;
$function$;