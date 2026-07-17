
CREATE OR REPLACE FUNCTION public.can_access_annual_review_instance_for_assistance(p_instance_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid       uuid := auth.uid();
  v_access    jsonb;
  v_scope     text;
  v_bu_ids    uuid[];
  v_emp_bu    uuid;
  v_emp_id    uuid;
  v_emp_mgr   uuid;
  v_is_named  boolean;
BEGIN
  IF v_uid IS NULL OR p_instance_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT i.employee_id,
         d.business_unit_id,
         p.reporting_manager_id,
         (i.manager_id = v_uid OR i.skip_id = v_uid)
    INTO v_emp_id, v_emp_bu, v_emp_mgr, v_is_named
  FROM public.annual_review_instances i
  LEFT JOIN public.profiles p    ON p.id = i.employee_id
  LEFT JOIN public.departments d ON d.id = p.department_id
  WHERE i.id = p_instance_id;

  IF v_emp_id IS NULL THEN
    RETURN false;
  END IF;

  v_access := public.annual_review_directory_access(v_uid);
  IF NOT COALESCE((v_access->>'can_access')::boolean, false) THEN
    RETURN false;
  END IF;

  v_scope  := v_access->>'scope';
  v_bu_ids := COALESCE(
    ARRAY(SELECT jsonb_array_elements_text(v_access->'business_unit_ids'))::uuid[],
    CASE WHEN NULLIF(v_access->>'business_unit_id','') IS NOT NULL
         THEN ARRAY[(v_access->>'business_unit_id')::uuid]
         ELSE ARRAY[]::uuid[] END
  );

  -- scope='all' (Admin / HR PMS / HR-BU): read-only widening across every stage.
  IF v_scope = 'all' THEN
    RETURN true;
  END IF;

  -- scope='bu' (BU-Head / HOD): allow when the employee's BU is in the caller's BU set.
  IF v_scope = 'bu' AND v_emp_bu IS NOT NULL AND v_emp_bu = ANY(v_bu_ids) THEN
    RETURN true;
  END IF;

  -- scope='team' (plain Reporting / Skip-Level Manager): allow when the caller
  -- is already the named reviewer, or the employee is a direct/skip report.
  IF v_scope = 'team' THEN
    IF COALESCE(v_is_named, false) THEN
      RETURN true;
    END IF;
    IF v_emp_mgr = v_uid THEN
      RETURN true;
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.profiles pm
       WHERE pm.id = v_emp_mgr AND pm.reporting_manager_id = v_uid
    ) THEN
      RETURN true;
    END IF;
  END IF;

  RETURN false;
END;
$function$;
