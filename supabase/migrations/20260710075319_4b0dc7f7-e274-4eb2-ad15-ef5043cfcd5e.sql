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
  v_access jsonb;
  v_scope text;
  v_access_bu uuid;
BEGIN
  IF _proxy_user_id IS NULL OR _instance_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT assisted_self_submission_enabled INTO v_enabled FROM public.app_settings LIMIT 1;
  IF NOT COALESCE(v_enabled, false) THEN
    RETURN false;
  END IF;

  SELECT i.employee_id, i.manager_id, i.skip_id, i.overall_status::text, d.business_unit_id
    INTO v_employee_id, v_manager_id, v_skip_id, v_status, v_emp_bu
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

DROP POLICY IF EXISTS instances_select_directory_assistance ON public.annual_review_instances;
CREATE POLICY instances_select_directory_assistance
ON public.annual_review_instances
FOR SELECT
TO authenticated
USING (
  overall_status = 'pending_self'::annual_review_status
  AND (
    (public.annual_review_directory_access(auth.uid())->>'scope') = 'all'
    OR EXISTS (
      SELECT 1
      FROM public.profiles p
      JOIN public.departments d ON d.id = p.department_id
      WHERE p.id = annual_review_instances.employee_id
        AND d.business_unit_id = NULLIF(public.annual_review_directory_access(auth.uid())->>'business_unit_id','')::uuid
        AND (public.annual_review_directory_access(auth.uid())->>'scope') = 'bu'
    )
  )
);

DROP POLICY IF EXISTS responses_select_directory_assistance ON public.annual_review_responses;
CREATE POLICY responses_select_directory_assistance
ON public.annual_review_responses
FOR SELECT
TO authenticated
USING (
  reviewer_role = 'self'::annual_reviewer_role
  AND EXISTS (
    SELECT 1
    FROM public.annual_review_instances i
    LEFT JOIN public.profiles p ON p.id = i.employee_id
    LEFT JOIN public.departments d ON d.id = p.department_id
    WHERE i.id = annual_review_responses.instance_id
      AND i.overall_status = 'pending_self'::annual_review_status
      AND (
        (public.annual_review_directory_access(auth.uid())->>'scope') = 'all'
        OR (
          (public.annual_review_directory_access(auth.uid())->>'scope') = 'bu'
          AND d.business_unit_id = NULLIF(public.annual_review_directory_access(auth.uid())->>'business_unit_id','')::uuid
        )
      )
  )
);

GRANT EXECUTE ON FUNCTION public.can_proxy_submit_annual_review(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_annual_review_self_as_proxy(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_annual_review_directory_access() TO authenticated;