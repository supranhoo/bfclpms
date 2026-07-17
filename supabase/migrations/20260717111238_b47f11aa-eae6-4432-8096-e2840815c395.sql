
-- ADR-110: Extend annual_review_directory_access with a 'team' scope for
-- plain Reporting / Skip-Level Managers. Server-only enforcement; client is
-- a passthrough. First-match order preserved for existing scopes.

CREATE OR REPLACE FUNCTION public.annual_review_directory_access(v_uid uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_bu    uuid;
  v_hr_bu uuid;
  v_match boolean;
  v_team  boolean;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('can_access', false);
  END IF;

  IF public.has_role(v_uid, 'admin'::app_role)
     OR public.has_role(v_uid, 'hr_pms'::app_role) THEN
    RETURN jsonb_build_object('can_access', true, 'scope', 'all', 'business_unit_id', NULL);
  END IF;

  SELECT hr_business_unit_id INTO v_hr_bu
  FROM public.org_head_config
  WHERE hr_business_unit_id IS NOT NULL
  ORDER BY id
  LIMIT 1;

  IF v_hr_bu IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.profiles p
      JOIN public.departments d ON d.id = p.department_id
      WHERE p.id = v_uid AND p.is_active = true AND d.business_unit_id = v_hr_bu
    ) INTO v_match;
    IF v_match THEN
      RETURN jsonb_build_object('can_access', true, 'scope', 'all', 'business_unit_id', NULL);
    END IF;
  END IF;

  SELECT id INTO v_bu
  FROM public.business_units
  WHERE head_user_id = v_uid
  LIMIT 1;

  IF v_bu IS NOT NULL THEN
    RETURN jsonb_build_object('can_access', true, 'scope', 'bu', 'business_unit_id', v_bu);
  END IF;

  SELECT business_unit_id INTO v_bu
  FROM public.departments
  WHERE head_user_id = v_uid AND business_unit_id IS NOT NULL
  LIMIT 1;

  IF v_bu IS NOT NULL THEN
    RETURN jsonb_build_object('can_access', true, 'scope', 'bu', 'business_unit_id', v_bu);
  END IF;

  -- Rule 6 (new): plain Reporting / Skip-Level Manager.
  -- Qualifies if the user has ≥1 active direct report, ≥1 active skip report,
  -- or already appears as manager_id/skip_id on any AR instance.
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
     WHERE p.reporting_manager_id = v_uid AND p.is_active = true
  ) OR EXISTS (
    SELECT 1
      FROM public.profiles p
      JOIN public.profiles pm ON pm.id = p.reporting_manager_id
     WHERE pm.reporting_manager_id = v_uid AND p.is_active = true
  ) OR EXISTS (
    SELECT 1 FROM public.annual_review_instances i
     WHERE i.manager_id = v_uid OR i.skip_id = v_uid
  ) INTO v_team;

  IF v_team THEN
    RETURN jsonb_build_object('can_access', true, 'scope', 'team', 'business_unit_id', NULL);
  END IF;

  RETURN jsonb_build_object('can_access', false);
END;
$function$;

-- search_active_employees_for_review: add 'team' scope branch.
CREATE OR REPLACE FUNCTION public.search_active_employees_for_review(
  p_query text, p_cycle_id uuid, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0
)
RETURNS TABLE(
  employee_id uuid, full_name text, employee_code text, designation text,
  department_id uuid, has_email boolean, has_signed_in boolean,
  instance_id uuid, overall_status text, in_my_queue boolean
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid    uuid := auth.uid();
  v_q      text := nullif(trim(coalesce(p_query, '')), '');
  v_lim    int  := least(greatest(coalesce(p_limit, 50), 1), 100);
  v_off    int  := greatest(coalesce(p_offset, 0), 0);
  v_access jsonb;
  v_scope  text;
  v_bu     uuid;
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

  RETURN QUERY
  SELECT
    p.id                                                AS employee_id,
    p.full_name,
    p.employee_code,
    p.designation,
    p.department_id,
    (p.email IS NOT NULL AND length(trim(p.email)) > 0) AS has_email,
    (u.last_sign_in_at IS NOT NULL)                     AS has_signed_in,
    i.id                                                AS instance_id,
    i.overall_status::text                              AS overall_status,
    (i.manager_id = v_uid OR i.skip_id = v_uid
       OR i.bu_head_id = v_uid OR i.hr_id = v_uid)      AS in_my_queue
  FROM public.profiles p
  LEFT JOIN public.departments d ON d.id = p.department_id
  LEFT JOIN auth.users u ON u.id = p.id
  LEFT JOIN public.annual_review_instances i
         ON i.employee_id = p.id AND i.cycle_id = p_cycle_id
  WHERE p.is_active = true
    AND (
      v_scope = 'all'
      OR (v_scope = 'bu'   AND d.business_unit_id = v_bu)
      OR (v_scope = 'team' AND (
            p.reporting_manager_id = v_uid
            OR EXISTS (
              SELECT 1 FROM public.profiles pm
               WHERE pm.id = p.reporting_manager_id
                 AND pm.reporting_manager_id = v_uid
            )
            OR (i.manager_id = v_uid OR i.skip_id = v_uid)
         ))
    )
    AND (
      v_q IS NULL
      OR p.full_name     ILIKE '%' || v_q || '%'
      OR p.employee_code ILIKE '%' || v_q || '%'
    )
  ORDER BY
    (CASE WHEN v_q IS NOT NULL AND lower(p.employee_code) = lower(v_q) THEN 0 ELSE 1 END),
    (CASE WHEN v_q IS NOT NULL AND p.full_name ILIKE v_q || '%' THEN 0 ELSE 1 END),
    p.full_name ASC
  LIMIT v_lim OFFSET v_off;
END;
$function$;

-- create_or_get_annual_review_instance: enforce 'team' scope on writes and
-- record reporting_manager actor scope in the audit trail.
CREATE OR REPLACE FUNCTION public.create_or_get_annual_review_instance(
  p_employee_id uuid, p_cycle_id uuid
)
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
  v_emp_mgr   uuid;
  v_access    jsonb;
  v_scope     text;
  v_bu        uuid;
  v_actor_scope text;
  v_in_team   boolean;
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
    INTO v_active, v_emp_mgr, v_emp_bu
  FROM public.profiles p
  LEFT JOIN public.departments d ON d.id = p.department_id
  WHERE p.id = p_employee_id;

  IF v_active IS NULL THEN
    RAISE EXCEPTION 'Employee not found';
  END IF;
  IF NOT v_active THEN
    RAISE EXCEPTION 'Employee is inactive';
  END IF;

  v_manager := v_emp_mgr;

  IF v_scope = 'bu' AND (v_emp_bu IS NULL OR v_emp_bu <> v_bu) THEN
    RAISE EXCEPTION 'permission denied: employee outside your business unit'
      USING ERRCODE = '42501';
  END IF;

  IF v_scope = 'team' THEN
    SELECT (
      v_emp_mgr = v_uid
      OR EXISTS (
        SELECT 1 FROM public.profiles pm
         WHERE pm.id = v_emp_mgr AND pm.reporting_manager_id = v_uid
      )
      OR EXISTS (
        SELECT 1 FROM public.annual_review_instances i
         WHERE i.employee_id = p_employee_id
           AND (i.manager_id = v_uid OR i.skip_id = v_uid)
      )
    ) INTO v_in_team;

    IF NOT COALESCE(v_in_team, false) THEN
      RAISE EXCEPTION 'permission denied: employee is not in your reporting team'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  IF public.has_role(v_uid, 'admin'::app_role) THEN
    v_actor_scope := 'admin';
  ELSIF public.has_role(v_uid, 'hr_pms'::app_role) THEN
    v_actor_scope := 'hr_pms';
  ELSIF v_scope = 'all' THEN
    v_actor_scope := 'hr_team';
  ELSIF v_scope = 'bu' THEN
    IF EXISTS (SELECT 1 FROM public.business_units WHERE head_user_id = v_uid) THEN
      v_actor_scope := 'bu_head';
    ELSE
      v_actor_scope := 'hod';
    END IF;
  ELSE
    v_actor_scope := 'reporting_manager';
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
