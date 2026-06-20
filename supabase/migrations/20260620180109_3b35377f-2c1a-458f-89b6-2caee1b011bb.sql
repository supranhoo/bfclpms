
-- 1) Feature flag for the directory entry-point
ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS annual_review_directory_search_enabled boolean NOT NULL DEFAULT false;

-- 2) Server-side search across active employees for Annual Review directory.
--    Gated to Admin / HR PMS only.
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
  v_uid uuid := auth.uid();
  v_q   text := nullif(trim(coalesce(p_query, '')), '');
  v_lim int  := least(greatest(coalesce(p_limit, 50), 1), 100);
  v_off int  := greatest(coalesce(p_offset, 0), 0);
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  IF NOT (public.has_role(v_uid, 'admin'::app_role)
          OR public.has_role(v_uid, 'hr_pms'::app_role)) THEN
    RAISE EXCEPTION 'permission denied: admin or hr_pms role required'
      USING ERRCODE = '42501';
  END IF;

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
    AND (
      v_q IS NULL
      OR p.full_name     ILIKE '%' || v_q || '%'
      OR p.employee_code ILIKE '%' || v_q || '%'
    )
  ORDER BY
    -- exact employee_code match first
    (CASE WHEN v_q IS NOT NULL AND lower(p.employee_code) = lower(v_q) THEN 0 ELSE 1 END),
    -- then prefix match on name
    (CASE WHEN v_q IS NOT NULL AND p.full_name ILIKE v_q || '%' THEN 0 ELSE 1 END),
    p.full_name ASC
  LIMIT v_lim OFFSET v_off;
END;
$$;

REVOKE ALL ON FUNCTION public.search_active_employees_for_review(text, uuid, int, int) FROM public;
GRANT EXECUTE ON FUNCTION public.search_active_employees_for_review(text, uuid, int, int) TO authenticated;

-- 3) Idempotent create-or-get for an annual review instance.
--    Resolves template from any active assignment rule on the cycle (highest priority first).
--    Reporting chain: profile.reporting_manager_id -> that profile's reporting_manager_id (skip).
--    BU head + HR are left NULL — admins can wire them via existing reassignment RPCs.
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
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  IF NOT (public.has_role(v_uid, 'admin'::app_role)
          OR public.has_role(v_uid, 'hr_pms'::app_role)) THEN
    RAISE EXCEPTION 'permission denied: admin or hr_pms role required'
      USING ERRCODE = '42501';
  END IF;

  IF p_employee_id IS NULL OR p_cycle_id IS NULL THEN
    RAISE EXCEPTION 'employee_id and cycle_id are required';
  END IF;

  -- Employee must exist and be active
  SELECT is_active, reporting_manager_id
    INTO v_active, v_manager
  FROM public.profiles
  WHERE id = p_employee_id;

  IF v_active IS NULL THEN
    RAISE EXCEPTION 'Employee not found';
  END IF;
  IF NOT v_active THEN
    RAISE EXCEPTION 'Employee is inactive';
  END IF;

  -- Idempotent: return existing instance if present
  SELECT id INTO v_existing
  FROM public.annual_review_instances
  WHERE employee_id = p_employee_id AND cycle_id = p_cycle_id;

  IF v_existing IS NOT NULL THEN
    instance_id := v_existing;
    was_created := false;
    RETURN NEXT;
    RETURN;
  END IF;

  -- Resolve template from any active assignment rule on the cycle
  SELECT r.id, r.template_id
    INTO v_rule, v_template
  FROM public.annual_review_assignment_rules r
  WHERE r.cycle_id = p_cycle_id AND r.is_active = true
  ORDER BY r.priority ASC, r.created_at ASC
  LIMIT 1;

  IF v_template IS NULL THEN
    RAISE EXCEPTION 'No active assignment rule configured for this cycle. Please configure one in Admin → Annual Review.';
  END IF;

  -- Skip = reporting manager of the reporting manager
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

  -- Audit
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
      'source',      'directory_search'
    )
  );

  instance_id := v_new_id;
  was_created := true;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.create_or_get_annual_review_instance(uuid, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.create_or_get_annual_review_instance(uuid, uuid) TO authenticated;
