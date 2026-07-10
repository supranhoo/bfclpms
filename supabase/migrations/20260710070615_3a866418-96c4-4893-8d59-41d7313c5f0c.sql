
CREATE OR REPLACE FUNCTION public.create_or_get_annual_review_instance(p_employee_id uuid, p_cycle_id uuid)
RETURNS TABLE(instance_id uuid, was_created boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid       uuid := auth.uid();
  v_existing  uuid;
  v_template  uuid;
  v_rule      uuid;
  v_manager   uuid;
  v_skip      uuid;
  v_active    boolean;
  v_new_id    uuid;
  v_emp_bu    uuid;
  v_access    jsonb;
  v_scope     text;
  v_bu        uuid;
  v_actor_scope text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  v_access := public.annual_review_directory_access(v_uid);
  IF NOT COALESCE((v_access->>'can_access')::boolean, false) THEN
    RAISE EXCEPTION 'permission denied: directory access not granted'
      USING ERRCODE = '42501';
  END IF;

  v_scope := v_access->>'scope';
  v_bu    := NULLIF(v_access->>'business_unit_id','')::uuid;

  IF p_employee_id IS NULL OR p_cycle_id IS NULL THEN
    RAISE EXCEPTION 'employee_id and cycle_id are required';
  END IF;

  SELECT p.is_active, p.reporting_manager_id, d.business_unit_id
    INTO v_active, v_manager, v_emp_bu
  FROM public.profiles p
  LEFT JOIN public.departments d ON d.id = p.department_id
  WHERE p.id = p_employee_id;

  IF v_active IS NULL THEN
    RAISE EXCEPTION 'Employee not found';
  END IF;
  IF NOT v_active THEN
    RAISE EXCEPTION 'Employee is inactive';
  END IF;

  IF v_scope = 'bu' AND (v_emp_bu IS NULL OR v_emp_bu <> v_bu) THEN
    RAISE EXCEPTION 'permission denied: employee outside your business unit'
      USING ERRCODE = '42501';
  END IF;

  IF public.has_role(v_uid, 'admin'::app_role) THEN
    v_actor_scope := 'admin';
  ELSIF public.has_role(v_uid, 'hr_pms'::app_role) THEN
    v_actor_scope := 'hr_pms';
  ELSIF v_scope = 'all' THEN
    v_actor_scope := 'hr_team';
  ELSIF EXISTS (SELECT 1 FROM public.business_units WHERE head_user_id = v_uid) THEN
    v_actor_scope := 'bu_head';
  ELSE
    v_actor_scope := 'hod';
  END IF;

  SELECT id INTO v_existing
  FROM public.annual_review_instances
  WHERE employee_id = p_employee_id AND cycle_id = p_cycle_id;

  IF v_existing IS NOT NULL THEN
    instance_id := v_existing;
    was_created := false;
    RETURN NEXT;
    RETURN;
  END IF;

  SELECT r.id, r.template_id
    INTO v_rule, v_template
  FROM public.annual_review_assignment_rules r
  WHERE r.cycle_id = p_cycle_id AND r.is_active = true
  ORDER BY r.priority ASC, r.created_at ASC
  LIMIT 1;

  IF v_template IS NULL THEN
    RAISE EXCEPTION 'No active assignment rule configured for this cycle. Please configure one in Admin → Annual Review.';
  END IF;

  IF v_manager IS NOT NULL THEN
    SELECT reporting_manager_id INTO v_skip
    FROM public.profiles
    WHERE id = v_manager;
  END IF;

  INSERT INTO public.annual_review_instances (
    employee_id, cycle_id, template_id, assigned_rule_id,
    manager_id, skip_id, overall_status
  )
  VALUES (
    p_employee_id, p_cycle_id, v_template, v_rule,
    v_manager, v_skip, 'pending_self'
  )
  RETURNING id INTO v_new_id;

  INSERT INTO public.system_audit_logs (action, performed_by, metadata)
  VALUES (
    'annual_review.instance.auto_created',
    v_uid,
    jsonb_build_object(
      'instance_id', v_new_id,
      'employee_id', p_employee_id,
      'cycle_id',    p_cycle_id,
      'template_id', v_template,
      'manager_id',  v_manager,
      'skip_id',     v_skip,
      'source',      'directory_search',
      'actor_scope', v_actor_scope
    )
  );

  instance_id := v_new_id;
  was_created := true;
  RETURN NEXT;
END;
$function$;
