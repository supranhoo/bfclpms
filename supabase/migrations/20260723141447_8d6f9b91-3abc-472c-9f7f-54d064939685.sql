
-- ADR-146: HOD directory scope is department, not BU

CREATE OR REPLACE FUNCTION public.annual_review_directory_access(v_uid uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_hr_bu       uuid;
  v_hr_bu_match boolean := false;
  v_bu_ids      uuid[] := ARRAY[]::uuid[];
  v_dept_ids    uuid[] := ARRAY[]::uuid[];
  v_home_bu     uuid;
  v_team        boolean := false;
  v_is_bu_head  boolean := false;
  v_override    public.annual_review_directory_overrides%ROWTYPE;
  v_source      text;
  v_scope       text := 'none';
  v_can_search  boolean := false;
  v_can_assist  boolean := false;
  v_assist_scope text := 'none';
  v_cap         public.annual_review_role_capabilities%ROWTYPE;
  v_assist_bu_ids uuid[] := ARRAY[]::uuid[];
  v_assist_dept_ids uuid[] := ARRAY[]::uuid[];
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('can_access', false, 'can_assist', false, 'source', 'none');
  END IF;

  SELECT * INTO v_override FROM public.annual_review_directory_overrides WHERE user_id = v_uid;
  IF FOUND THEN
    IF v_override.override_type = 'deny' THEN
      RETURN jsonb_build_object(
        'can_access', false, 'scope', 'none',
        'business_unit_id', NULL, 'business_unit_ids', to_jsonb(ARRAY[]::uuid[]),
        'department_ids', to_jsonb(ARRAY[]::uuid[]),
        'can_assist', false,
        'assist', jsonb_build_object('can_assist', false, 'scope', 'none', 'business_unit_ids', to_jsonb(ARRAY[]::uuid[]), 'department_ids', to_jsonb(ARRAY[]::uuid[]), 'source', 'override_deny'),
        'source', 'override_deny'
      );
    ELSIF v_override.override_type = 'grant_all' THEN
      RETURN jsonb_build_object(
        'can_access', true, 'scope', 'all',
        'business_unit_id', NULL, 'business_unit_ids', to_jsonb(ARRAY[]::uuid[]),
        'department_ids', to_jsonb(ARRAY[]::uuid[]),
        'can_assist', v_override.can_assist,
        'assist', jsonb_build_object('can_assist', v_override.can_assist, 'scope', CASE WHEN v_override.can_assist THEN 'all' ELSE 'none' END, 'business_unit_ids', to_jsonb(ARRAY[]::uuid[]), 'department_ids', to_jsonb(ARRAY[]::uuid[]), 'source', 'override_grant_all'),
        'source', 'override_grant_all'
      );
    ELSIF v_override.override_type = 'grant_bu' THEN
      RETURN jsonb_build_object(
        'can_access', true, 'scope', 'bu',
        'business_unit_id', COALESCE(v_override.business_unit_ids[1], NULL),
        'business_unit_ids', to_jsonb(COALESCE(v_override.business_unit_ids, ARRAY[]::uuid[])),
        'department_ids', to_jsonb(ARRAY[]::uuid[]),
        'can_assist', v_override.can_assist,
        'assist', jsonb_build_object('can_assist', v_override.can_assist, 'scope', CASE WHEN v_override.can_assist THEN 'bu' ELSE 'none' END, 'business_unit_ids', to_jsonb(COALESCE(v_override.business_unit_ids, ARRAY[]::uuid[])), 'department_ids', to_jsonb(ARRAY[]::uuid[]), 'source', 'override_grant_bu'),
        'source', 'override_grant_bu'
      );
    ELSIF v_override.override_type = 'grant_team' THEN
      RETURN jsonb_build_object(
        'can_access', true, 'scope', 'team',
        'business_unit_id', NULL, 'business_unit_ids', to_jsonb(ARRAY[]::uuid[]),
        'department_ids', to_jsonb(ARRAY[]::uuid[]),
        'can_assist', v_override.can_assist,
        'assist', jsonb_build_object('can_assist', v_override.can_assist, 'scope', CASE WHEN v_override.can_assist THEN 'team' ELSE 'none' END, 'business_unit_ids', to_jsonb(ARRAY[]::uuid[]), 'department_ids', to_jsonb(ARRAY[]::uuid[]), 'source', 'override_grant_team'),
        'source', 'override_grant_team'
      );
    END IF;
  END IF;

  IF public.has_role(v_uid,'admin'::app_role) THEN
    v_source := 'admin'; v_scope := 'all';
  ELSIF public.has_role(v_uid,'hr_pms'::app_role) THEN
    v_source := 'hr_pms'; v_scope := 'all';
  ELSE
    SELECT hr_business_unit_id INTO v_hr_bu FROM public.org_head_config
     WHERE hr_business_unit_id IS NOT NULL ORDER BY id LIMIT 1;
    IF v_hr_bu IS NOT NULL THEN
      SELECT EXISTS (
        SELECT 1 FROM public.profiles p
        JOIN public.departments d ON d.id = p.department_id
        WHERE p.id = v_uid AND p.is_active = true AND d.business_unit_id = v_hr_bu
      ) INTO v_hr_bu_match;
    END IF;

    IF v_hr_bu_match THEN
      v_source := 'hr_team'; v_scope := 'all';
    ELSE
      -- Direct BU headship (source of BU scope)
      SELECT COALESCE(array_agg(DISTINCT id) FILTER (WHERE id IS NOT NULL), ARRAY[]::uuid[])
        INTO v_bu_ids
      FROM public.business_units WHERE head_user_id = v_uid;
      v_is_bu_head := array_length(v_bu_ids, 1) IS NOT NULL;

      -- HOD department set (only used when NOT also a BU head)
      SELECT COALESCE(array_agg(DISTINCT id) FILTER (WHERE id IS NOT NULL), ARRAY[]::uuid[])
        INTO v_dept_ids
      FROM public.departments WHERE head_user_id = v_uid;

      SELECT EXISTS (
        SELECT 1 FROM public.profiles p WHERE p.reporting_manager_id = v_uid AND p.is_active = true
      ) OR EXISTS (
        SELECT 1 FROM public.profiles p
        JOIN public.profiles pm ON pm.id = p.reporting_manager_id
         WHERE pm.reporting_manager_id = v_uid AND p.is_active = true
      ) OR EXISTS (
        SELECT 1 FROM public.annual_review_instances i
         WHERE i.manager_id = v_uid OR i.skip_id = v_uid
      ) INTO v_team;

      IF v_is_bu_head THEN
        -- BU Head: union headed BUs + home BU (unchanged behavior)
        SELECT d.business_unit_id INTO v_home_bu FROM public.profiles p
        LEFT JOIN public.departments d ON d.id = p.department_id
        WHERE p.id = v_uid AND p.is_active = true;
        IF v_home_bu IS NOT NULL AND NOT (v_home_bu = ANY(v_bu_ids)) THEN
          v_bu_ids := v_bu_ids || v_home_bu;
        END IF;
        v_source := 'bu_head';
        v_scope  := 'bu';
      ELSIF array_length(v_dept_ids, 1) IS NOT NULL THEN
        -- Pure HOD: scope limited to their own department(s), NOT the whole BU
        v_source := 'hod';
        v_scope  := 'department';
        v_bu_ids := ARRAY[]::uuid[];
      ELSIF v_team THEN
        IF EXISTS (SELECT 1 FROM public.profiles p WHERE p.reporting_manager_id = v_uid AND p.is_active = true) THEN
          v_source := 'reporting_manager';
        ELSE
          v_source := 'skip_manager';
        END IF;
        v_scope := 'team';
      END IF;
    END IF;
  END IF;

  IF v_source IS NULL THEN
    RETURN jsonb_build_object(
      'can_access', false, 'scope', 'none',
      'business_unit_id', NULL, 'business_unit_ids', to_jsonb(ARRAY[]::uuid[]),
      'department_ids', to_jsonb(ARRAY[]::uuid[]),
      'can_assist', false,
      'assist', jsonb_build_object('can_assist', false, 'scope', 'none', 'business_unit_ids', to_jsonb(ARRAY[]::uuid[]), 'department_ids', to_jsonb(ARRAY[]::uuid[]), 'source', 'none'),
      'source', 'none'
    );
  END IF;

  SELECT * INTO v_cap FROM public.annual_review_role_capabilities WHERE role_source = v_source;
  v_can_search := COALESCE(v_cap.can_search, false);
  v_can_assist := COALESCE(v_cap.can_assist, false);

  IF v_can_assist THEN
    IF COALESCE(v_cap.assist_scope,'same_as_search') = 'direct_reports_only' THEN
      v_assist_scope := 'direct';
    ELSE
      v_assist_scope := v_scope;
    END IF;
  ELSE
    v_assist_scope := 'none';
  END IF;

  IF v_scope = 'bu' AND v_can_assist THEN
    v_assist_bu_ids := v_bu_ids;
  END IF;
  IF v_scope = 'department' AND v_can_assist THEN
    v_assist_dept_ids := v_dept_ids;
  END IF;

  IF NOT v_can_search THEN
    RETURN jsonb_build_object(
      'can_access', false, 'scope', 'none',
      'business_unit_id', NULL, 'business_unit_ids', to_jsonb(ARRAY[]::uuid[]),
      'department_ids', to_jsonb(ARRAY[]::uuid[]),
      'can_assist', false,
      'assist', jsonb_build_object('can_assist', false, 'scope', 'none', 'business_unit_ids', to_jsonb(ARRAY[]::uuid[]), 'department_ids', to_jsonb(ARRAY[]::uuid[]), 'source', v_source),
      'source', v_source
    );
  END IF;

  RETURN jsonb_build_object(
    'can_access', true,
    'scope', v_scope,
    'business_unit_id', CASE WHEN v_scope = 'bu' THEN v_bu_ids[1] ELSE NULL END,
    'business_unit_ids', to_jsonb(CASE WHEN v_scope='bu' THEN v_bu_ids ELSE ARRAY[]::uuid[] END),
    'department_ids', to_jsonb(CASE WHEN v_scope='department' THEN v_dept_ids ELSE ARRAY[]::uuid[] END),
    'can_assist', v_can_assist,
    'assist', jsonb_build_object(
      'can_assist', v_can_assist,
      'scope', v_assist_scope,
      'business_unit_ids', to_jsonb(v_assist_bu_ids),
      'department_ids', to_jsonb(v_assist_dept_ids),
      'source', v_source
    ),
    'source', v_source
  );
END;
$function$;

-- Search RPC: enforce department scope
CREATE OR REPLACE FUNCTION public.search_active_employees_for_review(p_query text, p_cycle_id uuid, p_limit integer DEFAULT 50, p_offset integer DEFAULT 0)
 RETURNS TABLE(employee_id uuid, full_name text, employee_code text, designation text, department_id uuid, has_email boolean, has_signed_in boolean, instance_id uuid, overall_status text, in_my_queue boolean, can_assist_this_employee boolean)
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
  v_bu_ids uuid[];
  v_dept_ids uuid[];
  v_assist jsonb;
  v_assist_scope text;
  v_assist_bu_ids uuid[];
  v_assist_dept_ids uuid[];
  v_source text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000'; END IF;

  v_access := public.annual_review_directory_access(v_uid);
  IF NOT COALESCE((v_access->>'can_access')::boolean, false) THEN
    RAISE EXCEPTION 'permission denied: directory access not granted' USING ERRCODE = '42501';
  END IF;

  v_scope  := v_access->>'scope';
  v_source := v_access->>'source';
  v_bu_ids := COALESCE(
    ARRAY(SELECT jsonb_array_elements_text(v_access->'business_unit_ids'))::uuid[],
    CASE WHEN NULLIF(v_access->>'business_unit_id','') IS NOT NULL
         THEN ARRAY[(v_access->>'business_unit_id')::uuid]
         ELSE ARRAY[]::uuid[] END
  );
  v_dept_ids := COALESCE(
    ARRAY(SELECT jsonb_array_elements_text(v_access->'department_ids'))::uuid[],
    ARRAY[]::uuid[]
  );

  v_assist := v_access->'assist';
  v_assist_scope := COALESCE(v_assist->>'scope','none');
  v_assist_bu_ids := COALESCE(
    ARRAY(SELECT jsonb_array_elements_text(v_assist->'business_unit_ids'))::uuid[],
    ARRAY[]::uuid[]
  );
  v_assist_dept_ids := COALESCE(
    ARRAY(SELECT jsonb_array_elements_text(v_assist->'department_ids'))::uuid[],
    ARRAY[]::uuid[]
  );

  RETURN QUERY
  SELECT
    p.id, p.full_name, p.employee_code, p.designation, p.department_id,
    (p.email IS NOT NULL AND length(trim(p.email)) > 0),
    (u.last_sign_in_at IS NOT NULL),
    i.id, i.overall_status::text,
    (i.manager_id = v_uid OR i.skip_id = v_uid OR i.bu_head_id = v_uid OR i.hr_id = v_uid),
    (
      CASE v_assist_scope
        WHEN 'all'        THEN true
        WHEN 'bu'         THEN d.business_unit_id = ANY(v_assist_bu_ids)
        WHEN 'department' THEN p.department_id = ANY(v_assist_dept_ids)
        WHEN 'team'       THEN EXISTS (SELECT 1 FROM public.annual_review_subtree_ids(v_uid) AS s(id) WHERE s.id = p.id)
        WHEN 'direct'     THEN (p.reporting_manager_id = v_uid)
        ELSE false
      END
    )
  FROM public.profiles p
  LEFT JOIN public.departments d ON d.id = p.department_id
  LEFT JOIN auth.users u ON u.id = p.id
  LEFT JOIN public.annual_review_instances i ON i.employee_id = p.id AND i.cycle_id = p_cycle_id
  WHERE p.is_active = true
    AND (
      v_scope = 'all'
      OR (v_scope = 'bu'         AND d.business_unit_id = ANY(v_bu_ids))
      OR (v_scope = 'department' AND p.department_id     = ANY(v_dept_ids))
      OR (v_scope = 'team' AND (
            p.reporting_manager_id = v_uid
            OR EXISTS (SELECT 1 FROM public.profiles pm
                        WHERE pm.id = p.reporting_manager_id AND pm.reporting_manager_id = v_uid)
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

-- Write path: enforce department scope
CREATE OR REPLACE FUNCTION public.create_or_get_annual_review_instance(p_employee_id uuid, p_cycle_id uuid)
 RETURNS TABLE(instance_id uuid, was_created boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid        uuid := auth.uid();
  v_existing   uuid;
  v_template   uuid;
  v_rule       uuid;
  v_manager    uuid;
  v_skip       uuid;
  v_active     boolean;
  v_new_id     uuid;
  v_emp_bu     uuid;
  v_emp_dept   uuid;
  v_emp_mgr    uuid;
  v_access     jsonb;
  v_scope      text;
  v_bu_ids     uuid[];
  v_dept_ids   uuid[];
  v_actor_scope text;
  v_in_team    boolean;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  v_access := public.annual_review_directory_access(v_uid);
  IF NOT COALESCE((v_access->>'can_access')::boolean, false) THEN
    RAISE EXCEPTION 'permission denied: directory access not granted'
      USING ERRCODE = '42501';
  END IF;

  v_scope  := v_access->>'scope';
  v_bu_ids := COALESCE(
    ARRAY(SELECT jsonb_array_elements_text(v_access->'business_unit_ids'))::uuid[],
    CASE WHEN NULLIF(v_access->>'business_unit_id','') IS NOT NULL
         THEN ARRAY[(v_access->>'business_unit_id')::uuid]
         ELSE ARRAY[]::uuid[] END
  );
  v_dept_ids := COALESCE(
    ARRAY(SELECT jsonb_array_elements_text(v_access->'department_ids'))::uuid[],
    ARRAY[]::uuid[]
  );

  IF p_employee_id IS NULL OR p_cycle_id IS NULL THEN
    RAISE EXCEPTION 'employee_id and cycle_id are required';
  END IF;

  SELECT p.is_active, p.reporting_manager_id, d.business_unit_id, p.department_id
    INTO v_active, v_emp_mgr, v_emp_bu, v_emp_dept
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

  IF v_scope = 'bu' AND (v_emp_bu IS NULL OR NOT (v_emp_bu = ANY(v_bu_ids))) THEN
    RAISE EXCEPTION 'permission denied: employee outside your business unit'
      USING ERRCODE = '42501';
  END IF;

  IF v_scope = 'department' AND (v_emp_dept IS NULL OR NOT (v_emp_dept = ANY(v_dept_ids))) THEN
    RAISE EXCEPTION 'permission denied: employee outside your department'
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
  ELSIF v_scope = 'department' THEN
    v_actor_scope := 'hod';
  ELSE
    v_actor_scope := 'reporting_manager';
  END IF;

  SELECT id INTO v_existing
  FROM public.annual_review_instances
  WHERE employee_id = p_employee_id AND cycle_id = p_cycle_id
  LIMIT 1;

  IF v_existing IS NOT NULL THEN
    instance_id := v_existing;
    was_created := false;
    RETURN NEXT;
    RETURN;
  END IF;

  SELECT ar.template_id, ar.id
    INTO v_template, v_rule
  FROM public.annual_review_assignment_rules ar
  WHERE ar.is_active = true
    AND (ar.employee_id IS NULL OR ar.employee_id = p_employee_id)
  ORDER BY ar.priority ASC NULLS LAST, ar.created_at ASC
  LIMIT 1;

  IF v_manager IS NOT NULL THEN
    SELECT reporting_manager_id INTO v_skip FROM public.profiles WHERE id = v_manager;
  END IF;

  INSERT INTO public.annual_review_instances (
    employee_id, cycle_id, template_id, manager_id, skip_id,
    overall_status, created_at, updated_at
  )
  VALUES (
    p_employee_id, p_cycle_id, v_template, v_manager, v_skip,
    'pending_self', now(), now()
  )
  RETURNING id INTO v_new_id;

  INSERT INTO public.system_audit_logs (event_type, actor_id, payload, created_at)
  VALUES (
    'annual_review.instance.auto_created',
    v_uid,
    jsonb_build_object(
      'instance_id', v_new_id,
      'employee_id', p_employee_id,
      'cycle_id', p_cycle_id,
      'template_id', v_template,
      'rule_id', v_rule,
      'actor_scope', v_actor_scope
    ),
    now()
  );

  instance_id := v_new_id;
  was_created := true;
  RETURN NEXT;
END;
$function$;

-- Assist gates: honor department scope
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
        v_dept_ids  uuid[];
        v_emp_bu    uuid;
        v_emp_dept  uuid;
        v_emp_id    uuid;
        v_emp_mgr   uuid;
        v_is_named  boolean;
      BEGIN
        IF v_uid IS NULL OR p_instance_id IS NULL THEN RETURN false; END IF;

        IF public.has_role(v_uid, 'management'::app_role) THEN
          RETURN true;
        END IF;

        SELECT i.employee_id,
               d.business_unit_id,
               p.department_id,
               p.reporting_manager_id,
               (i.manager_id = v_uid OR i.skip_id = v_uid
                OR i.dept_head_id = v_uid OR i.bu_head_id = v_uid
                OR i.management_id = v_uid)
          INTO v_emp_id, v_emp_bu, v_emp_dept, v_emp_mgr, v_is_named
        FROM public.annual_review_instances i
        LEFT JOIN public.profiles p    ON p.id = i.employee_id
        LEFT JOIN public.departments d ON d.id = p.department_id
        WHERE i.id = p_instance_id;

        IF v_emp_id IS NULL THEN RETURN false; END IF;

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
        v_dept_ids := COALESCE(
          ARRAY(SELECT jsonb_array_elements_text(v_access->'department_ids'))::uuid[],
          ARRAY[]::uuid[]
        );

        IF v_scope = 'all' THEN RETURN true; END IF;
        IF v_scope = 'bu' AND v_emp_bu IS NOT NULL AND v_emp_bu = ANY(v_bu_ids) THEN
          RETURN true;
        END IF;
        IF v_scope = 'department' AND v_emp_dept IS NOT NULL AND v_emp_dept = ANY(v_dept_ids) THEN
          RETURN true;
        END IF;
        IF v_scope = 'team' THEN
          IF COALESCE(v_is_named, false) THEN RETURN true; END IF;
          IF v_emp_mgr = v_uid THEN RETURN true; END IF;
          IF EXISTS (SELECT 1 FROM public.profiles pm
                      WHERE pm.id = v_emp_mgr AND pm.reporting_manager_id = v_uid) THEN
            RETURN true;
          END IF;
        END IF;
        RETURN false;
      END;
      $function$;

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
  v_assist jsonb;
  v_assist_scope text;
  v_assist_bu_ids uuid[];
  v_assist_dept_ids uuid[];
BEGIN
  IF _proxy_user_id IS NULL OR _instance_id IS NULL THEN RETURN false; END IF;
  IF auth.uid() IS DISTINCT FROM _proxy_user_id THEN RETURN false; END IF;

  SELECT assisted_self_submission_enabled INTO v_enabled FROM public.app_settings LIMIT 1;
  IF NOT COALESCE(v_enabled, false) THEN RETURN false; END IF;

  SELECT i.employee_id, i.manager_id, i.skip_id, i.overall_status::text, d.business_unit_id, p.department_id
    INTO v_employee_id, v_manager_id, v_skip_id, v_status, v_emp_bu, v_emp_dept
  FROM public.annual_review_instances i
  LEFT JOIN public.profiles p ON p.id = i.employee_id
  LEFT JOIN public.departments d ON d.id = p.department_id
  WHERE i.id = _instance_id;

  IF v_employee_id IS NULL OR v_status <> 'pending_self' THEN RETURN false; END IF;

  SELECT p.email, u.last_sign_in_at, p.designated_proxy_user_id
    INTO v_employee_email, v_employee_last_signin, v_designated
  FROM public.profiles p
  LEFT JOIN auth.users u ON u.id = p.id
  WHERE p.id = v_employee_id;

  IF v_employee_email IS NOT NULL AND v_employee_last_signin IS NOT NULL THEN RETURN false; END IF;

  IF _proxy_user_id = v_designated THEN RETURN true; END IF;

  v_access := public.annual_review_directory_access(_proxy_user_id);
  v_assist := v_access->'assist';
  IF NOT COALESCE((v_assist->>'can_assist')::boolean, false) THEN RETURN false; END IF;

  v_assist_scope := v_assist->>'scope';
  v_assist_bu_ids := COALESCE(
    ARRAY(SELECT jsonb_array_elements_text(v_assist->'business_unit_ids'))::uuid[],
    ARRAY[]::uuid[]
  );
  v_assist_dept_ids := COALESCE(
    ARRAY(SELECT jsonb_array_elements_text(v_assist->'department_ids'))::uuid[],
    ARRAY[]::uuid[]
  );

  IF v_assist_scope = 'all' THEN RETURN true; END IF;

  IF v_assist_scope = 'bu' THEN
    RETURN v_emp_bu IS NOT NULL AND v_emp_bu = ANY(v_assist_bu_ids);
  END IF;

  IF v_assist_scope = 'department' THEN
    RETURN v_emp_dept IS NOT NULL AND v_emp_dept = ANY(v_assist_dept_ids);
  END IF;

  IF v_assist_scope = 'team' THEN
    RETURN EXISTS (SELECT 1 FROM public.annual_review_subtree_ids(_proxy_user_id) AS s(id)
                    WHERE s.id = v_employee_id);
  END IF;

  IF v_assist_scope = 'direct' THEN
    RETURN v_manager_id = _proxy_user_id
        OR EXISTS (SELECT 1 FROM public.profiles p
                    WHERE p.id = v_employee_id AND p.reporting_manager_id = _proxy_user_id);
  END IF;

  RETURN false;
END;
$function$;

-- Seed role capability row for 'hod' if not present (assist follows same_as_search by default)
INSERT INTO public.annual_review_role_capabilities (role_source, can_search, can_assist, assist_scope)
VALUES ('hod', true, false, 'same_as_search')
ON CONFLICT (role_source) DO NOTHING;
