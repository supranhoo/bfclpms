
-- ADR-157: allow reassigning the Management reviewer

CREATE OR REPLACE FUNCTION public.reassign_annual_review_reviewer(
  p_instance_id uuid, p_role text, p_new_reviewer_id uuid, p_reason text
)
RETURNS public.annual_review_assignment_overrides
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_override public.annual_review_assignment_overrides;
  v_instance public.annual_review_instances;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'hr_pms')) THEN
    RAISE EXCEPTION 'Only admin or HR PMS can reassign reviewers.';
  END IF;
  IF p_role NOT IN ('manager','skip_manager','dept_head','bu_head','hr','management') THEN
    RAISE EXCEPTION 'Invalid role: %', p_role;
  END IF;
  IF p_reason IS NULL OR length(trim(p_reason)) < 3 THEN
    RAISE EXCEPTION 'Reason is required (min 3 characters).';
  END IF;
  IF p_new_reviewer_id IS NULL THEN
    RAISE EXCEPTION 'A reviewer must be selected.';
  END IF;

  SELECT * INTO v_instance FROM public.annual_review_instances WHERE id = p_instance_id;
  IF v_instance.id IS NULL THEN
    RAISE EXCEPTION 'Instance not found.';
  END IF;

  IF v_instance.employee_id = p_new_reviewer_id THEN
    RAISE EXCEPTION 'Reviewer cannot be the employee under review.';
  END IF;

  -- Role validation for management slot: target MUST hold the Management role and be active.
  IF p_role = 'management' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.user_roles ur
        JOIN public.profiles p ON p.id = ur.user_id
       WHERE ur.user_id = p_new_reviewer_id
         AND ur.role = 'management'
         AND p.is_active = true
    ) THEN
      RAISE EXCEPTION 'Selected user is not an active Management user.';
    END IF;
  END IF;

  INSERT INTO public.annual_review_assignment_overrides
    (instance_id, role, new_reviewer_id, reason, created_by)
  VALUES (p_instance_id, p_role, p_new_reviewer_id, p_reason, auth.uid())
  ON CONFLICT (instance_id, role) DO UPDATE
    SET new_reviewer_id = EXCLUDED.new_reviewer_id,
        reason = EXCLUDED.reason,
        created_by = auth.uid(),
        created_at = now()
  RETURNING * INTO v_override;

  IF p_role = 'manager' THEN
    UPDATE public.annual_review_instances SET manager_id = p_new_reviewer_id, updated_at = now() WHERE id = p_instance_id;
  ELSIF p_role = 'skip_manager' THEN
    UPDATE public.annual_review_instances SET skip_id = p_new_reviewer_id, updated_at = now() WHERE id = p_instance_id;
  ELSIF p_role = 'dept_head' THEN
    UPDATE public.annual_review_instances SET dept_head_id = p_new_reviewer_id, updated_at = now() WHERE id = p_instance_id;
  ELSIF p_role = 'bu_head' THEN
    UPDATE public.annual_review_instances SET bu_head_id = p_new_reviewer_id, updated_at = now() WHERE id = p_instance_id;
  ELSIF p_role = 'hr' THEN
    UPDATE public.annual_review_instances SET hr_id = p_new_reviewer_id, updated_at = now() WHERE id = p_instance_id;
  ELSIF p_role = 'management' THEN
    UPDATE public.annual_review_instances SET management_id = p_new_reviewer_id, updated_at = now() WHERE id = p_instance_id;
  END IF;

  INSERT INTO public.system_audit_logs (action, performed_by, metadata)
  VALUES (
    'annual_review.reviewer_reassigned',
    auth.uid(),
    jsonb_build_object(
      'instance_id', p_instance_id,
      'role', p_role,
      'new_reviewer_id', p_new_reviewer_id,
      'reason', p_reason
    )
  );

  RETURN v_override;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.reassign_annual_review_reviewer(uuid, text, uuid, text) TO authenticated;

-- Trigger: honour an explicit Management override so admin reassignment sticks.
CREATE OR REPLACE FUNCTION public.enforce_management_terminal_stage()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_has_bu             boolean;
  v_has_dept           boolean;
  v_employee_is_bu     boolean;
  v_reports_to_mgmt    boolean := false;
  v_reports_to         uuid;
  v_resolved           uuid;
  v_stages             jsonb;
  v_resolver_seed      uuid;
  v_override_mgmt      uuid;
BEGIN
  v_stages   := COALESCE(NEW.enabled_stages, '[]'::jsonb);
  v_has_bu   := v_stages ? 'bu_head';
  v_has_dept := v_stages ? 'dept_head';

  -- ADR-157: explicit admin override wins over resolver.
  SELECT o.new_reviewer_id INTO v_override_mgmt
    FROM public.annual_review_assignment_overrides o
   WHERE o.instance_id = NEW.id AND o.role = 'management'
   LIMIT 1;

  SELECT EXISTS (
    SELECT 1 FROM public.business_units bu WHERE bu.head_user_id = NEW.employee_id
  ) INTO v_employee_is_bu;

  SELECT p.reporting_manager_id INTO v_reports_to
    FROM public.profiles p WHERE p.id = NEW.employee_id;

  IF v_reports_to IS NOT NULL AND v_reports_to <> NEW.employee_id THEN
    SELECT EXISTS (
      SELECT 1 FROM public.user_roles ur
        JOIN public.profiles pm ON pm.id = ur.user_id
       WHERE ur.user_id = v_reports_to
         AND ur.role = 'management'
         AND pm.is_active = true
    ) INTO v_reports_to_mgmt;
  END IF;

  IF v_employee_is_bu THEN
    IF v_has_bu THEN
      SELECT COALESCE(jsonb_agg(elem), '[]'::jsonb) INTO v_stages
      FROM jsonb_array_elements(v_stages) elem
      WHERE elem <> to_jsonb('bu_head'::text);
      NEW.enabled_stages := v_stages;
    END IF;
    NEW.bu_head_id := NULL;
    v_resolver_seed := NEW.employee_id;

  ELSIF v_reports_to_mgmt THEN
    IF v_has_bu OR v_has_dept THEN
      SELECT COALESCE(jsonb_agg(elem), '[]'::jsonb) INTO v_stages
      FROM jsonb_array_elements(v_stages) elem
      WHERE elem NOT IN (to_jsonb('bu_head'::text), to_jsonb('dept_head'::text));
      NEW.enabled_stages := v_stages;
    END IF;
    NEW.bu_head_id   := NULL;
    NEW.dept_head_id := NULL;
    NEW.skip_id      := NULL;
    NEW.management_id := COALESCE(v_override_mgmt, v_reports_to);
    IF NOT (v_stages ? 'management') THEN
      NEW.enabled_stages := v_stages || jsonb_build_array('management');
    END IF;
    RETURN NEW;

  ELSIF v_has_bu AND NEW.bu_head_id IS NOT NULL THEN
    v_resolver_seed := NEW.bu_head_id;
  ELSE
    NEW.management_id := v_override_mgmt;  -- keep override if present, else NULL
    IF v_override_mgmt IS NULL AND (v_stages ? 'management') THEN
      SELECT COALESCE(jsonb_agg(elem), '[]'::jsonb) INTO NEW.enabled_stages
      FROM jsonb_array_elements(v_stages) elem
      WHERE elem <> to_jsonb('management'::text);
    END IF;
    RETURN NEW;
  END IF;

  v_resolved := public.resolve_management_reviewer(v_resolver_seed, NEW.employee_id);
  NEW.management_id := COALESCE(v_override_mgmt, v_resolved);

  IF NEW.management_id IS NULL THEN
    IF v_stages ? 'management' THEN
      SELECT COALESCE(jsonb_agg(elem), '[]'::jsonb) INTO NEW.enabled_stages
      FROM jsonb_array_elements(v_stages) elem
      WHERE elem <> to_jsonb('management'::text);
    END IF;
  ELSE
    IF NOT (v_stages ? 'management') THEN
      NEW.enabled_stages := v_stages || jsonb_build_array('management');
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

-- Enabled-stages RPC: also clear management_id when 'management' is removed.
CREATE OR REPLACE FUNCTION public.set_annual_review_enabled_stages(
  p_instance_id uuid,
  p_enabled_stages jsonb,
  p_reason text
)
RETURNS void
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  v_caller uuid := auth.uid();
  v_status public.annual_review_status;
  v_prev   jsonb;
  v_has_responses boolean;
  v_new_status public.annual_review_status;
  v_cleared jsonb := '{}'::jsonb;
  v_prev_mgr uuid; v_prev_skip uuid; v_prev_dept uuid; v_prev_bu uuid; v_prev_hr uuid; v_prev_mgmt uuid;
BEGIN
  IF NOT (public.has_role(v_caller,'admin') OR public.has_role(v_caller,'hr_pms')) THEN
    RAISE EXCEPTION 'only admin / hr_pms may change enabled_stages';
  END IF;
  IF p_reason IS NULL OR length(trim(p_reason)) < 3 THEN
    RAISE EXCEPTION 'reason is required (min 3 chars)';
  END IF;
  IF jsonb_typeof(p_enabled_stages) <> 'array' OR jsonb_array_length(p_enabled_stages) < 1 THEN
    RAISE EXCEPTION 'enabled_stages must be a non-empty JSON array';
  END IF;

  SELECT overall_status, enabled_stages, manager_id, skip_id, dept_head_id, bu_head_id, hr_id, management_id
    INTO v_status, v_prev, v_prev_mgr, v_prev_skip, v_prev_dept, v_prev_bu, v_prev_hr, v_prev_mgmt
    FROM public.annual_review_instances WHERE id = p_instance_id FOR UPDATE;

  SELECT EXISTS(SELECT 1 FROM public.annual_review_responses WHERE instance_id = p_instance_id)
    INTO v_has_responses;

  IF v_status NOT IN ('not_started','pending_self') AND v_has_responses THEN
    RAISE EXCEPTION 'cannot change workflow after review has been actioned';
  END IF;

  v_new_status := public.annual_review_first_pending_status(p_enabled_stages);

  IF v_prev_mgr  IS NOT NULL AND NOT (p_enabled_stages ? 'manager')      THEN v_cleared := v_cleared || jsonb_build_object('manager_id',  v_prev_mgr); END IF;
  IF v_prev_skip IS NOT NULL AND NOT (p_enabled_stages ? 'skip_manager') THEN v_cleared := v_cleared || jsonb_build_object('skip_id',     v_prev_skip); END IF;
  IF v_prev_dept IS NOT NULL AND NOT (p_enabled_stages ? 'dept_head')    THEN v_cleared := v_cleared || jsonb_build_object('dept_head_id',v_prev_dept); END IF;
  IF v_prev_bu   IS NOT NULL AND NOT (p_enabled_stages ? 'bu_head')      THEN v_cleared := v_cleared || jsonb_build_object('bu_head_id',  v_prev_bu); END IF;
  IF v_prev_hr   IS NOT NULL AND NOT (p_enabled_stages ? 'hr')           THEN v_cleared := v_cleared || jsonb_build_object('hr_id',       v_prev_hr); END IF;
  IF v_prev_mgmt IS NOT NULL AND NOT (p_enabled_stages ? 'management')   THEN v_cleared := v_cleared || jsonb_build_object('management_id', v_prev_mgmt); END IF;

  UPDATE public.annual_review_instances
     SET enabled_stages = p_enabled_stages,
         management_id = CASE WHEN p_enabled_stages ? 'management' THEN management_id ELSE NULL END,
         overall_status = CASE
           WHEN v_status = 'not_started' THEN v_status
           WHEN v_has_responses THEN v_status
           ELSE v_new_status
         END,
         updated_at = now()
   WHERE id = p_instance_id;

  -- If management removed, delete any override so the resolver won't re-add it.
  IF NOT (p_enabled_stages ? 'management') THEN
    DELETE FROM public.annual_review_assignment_overrides
     WHERE instance_id = p_instance_id AND role = 'management';
  END IF;

  INSERT INTO public.system_audit_logs(action, performed_by, metadata)
  VALUES ('annual_review.enabled_stages_set', v_caller, jsonb_build_object(
    'instance_id',        p_instance_id,
    'previous',           v_prev,
    'new',                p_enabled_stages,
    'reason',             p_reason,
    'retargeted_status',  CASE WHEN v_status IN ('not_started') OR v_has_responses THEN NULL ELSE v_new_status END,
    'cleared_reviewers',  v_cleared
  ));
END $function$;
