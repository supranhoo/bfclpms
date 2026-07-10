-- Expand Annual Review directory access to HR team members, BU Heads, and HODs.
-- Adds a resolver plus tightens the two existing RPCs to consult it.

-- 1) Access resolver — returns access + scope for a given user.
CREATE OR REPLACE FUNCTION public.annual_review_directory_access(v_uid uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_bu   uuid;
  v_hr_bu uuid;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('can_access', false);
  END IF;

  -- 1. Admin / HR PMS → all
  IF public.has_role(v_uid, 'admin'::app_role)
     OR public.has_role(v_uid, 'hr_pms'::app_role) THEN
    RETURN jsonb_build_object('can_access', true, 'scope', 'all', 'business_unit_id', NULL);
  END IF;

  -- 2. HR team → user belongs to the HR business unit (from org_head_config)
  SELECT hr_business_unit_id INTO v_hr_bu
  FROM public.org_head_config
  WHERE hr_business_unit_id IS NOT NULL
  ORDER BY id
  LIMIT 1;

  IF v_hr_bu IS NOT NULL THEN
    PERFORM 1 FROM public.profiles
    WHERE id = v_uid AND is_active = true AND business_unit_id = v_hr_bu;
    IF FOUND THEN
      RETURN jsonb_build_object('can_access', true, 'scope', 'all', 'business_unit_id', NULL);
    END IF;
  END IF;

  -- 3. BU Head (business_units.head_user_id)
  SELECT id INTO v_bu
  FROM public.business_units
  WHERE head_user_id = v_uid
  LIMIT 1;

  IF v_bu IS NOT NULL THEN
    RETURN jsonb_build_object('can_access', true, 'scope', 'bu', 'business_unit_id', v_bu);
  END IF;

  -- 4. HOD (departments.head_user_id) → scope to that department's BU
  SELECT business_unit_id INTO v_bu
  FROM public.departments
  WHERE head_user_id = v_uid AND business_unit_id IS NOT NULL
  LIMIT 1;

  IF v_bu IS NOT NULL THEN
    RETURN jsonb_build_object('can_access', true, 'scope', 'bu', 'business_unit_id', v_bu);
  END IF;

  RETURN jsonb_build_object('can_access', false);
END;
$$;

REVOKE ALL ON FUNCTION public.annual_review_directory_access(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.annual_review_directory_access(uuid) TO authenticated;

-- Convenience wrapper for the client — no arg (uses auth.uid()).
CREATE OR REPLACE FUNCTION public.get_annual_review_directory_access()
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.annual_review_directory_access(auth.uid());
$$;

REVOKE ALL ON FUNCTION public.get_annual_review_directory_access() FROM public;
GRANT EXECUTE ON FUNCTION public.get_annual_review_directory_access() TO authenticated;

-- 2) Patched search RPC — same signature/shape, wider access with BU scoping.
CREATE OR REPLACE FUNCTION public.search_active_employees_for_review(
  p_query text,
  p_cycle_id uuid,
  p_limit  int DEFAULT 50,
  p_offset int DEFAULT 0
)
RETURNS TABLE (
  employee_id      uuid,
  full_name        text,
  employee_code    text,
  designation      text,
  department_id    uuid,
  has_email        boolean,
  has_signed_in    boolean,
  instance_id      uuid,
  overall_status   text,
  in_my_queue      boolean
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
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
       OR i.bu_head_id = v_uid OR i.hr_id = v_uid)     AS in_my_queue
  FROM public.profiles p
  LEFT JOIN auth.users u ON u.id = p.id
  LEFT JOIN public.annual_review_instances i
         ON i.employee_id = p.id AND i.cycle_id = p_cycle_id
  WHERE p.is_active = true
    AND (v_scope = 'all' OR p.business_unit_id = v_bu)
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
$$;

REVOKE ALL ON FUNCTION public.search_active_employees_for_review(text, uuid, int, int) FROM public;
GRANT EXECUTE ON FUNCTION public.search_active_employees_for_review(text, uuid, int, int) TO authenticated;

-- 3) Patched create-or-get — same access resolver + BU cross-check on write.
CREATE OR REPLACE FUNCTION public.create_or_get_annual_review_instance(
  p_employee_id uuid,
  p_cycle_id    uuid
)
RETURNS TABLE (instance_id uuid, was_created boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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

  SELECT is_active, reporting_manager_id, business_unit_id
    INTO v_active, v_manager, v_emp_bu
  FROM public.profiles
  WHERE id = p_employee_id;

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

  -- Actor scope label for audit
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

  -- Idempotent
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

  INSERT INTO public.system_audit_logs (event_type, performed_by, payload)
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
$$;

REVOKE ALL ON FUNCTION public.create_or_get_annual_review_instance(uuid, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.create_or_get_annual_review_instance(uuid, uuid) TO authenticated;