
-- Fix ADR-160c enum mapping bug: 'pending_' || p_role produced invalid
-- values like 'pending_bu_head' and 'pending_dept_head'. Enum uses the
-- canonical short forms (pending_bu, pending_dept, pending_skip).

CREATE OR REPLACE FUNCTION public.reassign_annual_review_reviewer(
  p_instance_id uuid, p_role text, p_new_reviewer_id uuid, p_reason text, p_mode text DEFAULT 'redirect'::text
)
RETURNS annual_review_assignment_overrides
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_override public.annual_review_assignment_overrides;
  v_instance public.annual_review_instances;
  v_locked_resp public.annual_review_responses;
  v_old_reviewer uuid;
  v_target_status public.annual_review_status;
  v_was_completed boolean := false;
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
  IF p_mode NOT IN ('redirect','supersede') THEN
    RAISE EXCEPTION 'invalid mode: %', p_mode;
  END IF;
  IF p_mode = 'supersede' AND length(trim(p_reason)) < 10 THEN
    RAISE EXCEPTION 'supersede mode requires a reason of at least 10 characters';
  END IF;

  SELECT * INTO v_instance FROM public.annual_review_instances WHERE id = p_instance_id FOR UPDATE;
  IF v_instance.id IS NULL THEN
    RAISE EXCEPTION 'Instance not found.';
  END IF;
  IF v_instance.employee_id = p_new_reviewer_id THEN
    RAISE EXCEPTION 'Reviewer cannot be the employee under review.';
  END IF;

  IF p_role = 'management' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.user_roles ur
        JOIN public.profiles p ON p.id = ur.user_id
       WHERE ur.user_id = p_new_reviewer_id AND ur.role = 'management' AND p.is_active = true
    ) THEN
      RAISE EXCEPTION 'Selected user is not an active Management user.';
    END IF;
  END IF;

  v_was_completed := (v_instance.overall_status = 'completed');

  v_old_reviewer := CASE p_role
    WHEN 'manager'      THEN v_instance.manager_id
    WHEN 'skip_manager' THEN v_instance.skip_id
    WHEN 'dept_head'    THEN v_instance.dept_head_id
    WHEN 'bu_head'      THEN v_instance.bu_head_id
    WHEN 'hr'           THEN v_instance.hr_id
    WHEN 'management'   THEN v_instance.management_id
  END;

  IF p_mode = 'supersede' THEN
    SELECT * INTO v_locked_resp FROM public.annual_review_responses
     WHERE instance_id = p_instance_id
       AND reviewer_role = p_role::public.annual_reviewer_role
       AND is_locked = true;
    IF v_locked_resp.id IS NOT NULL THEN
      PERFORM public._ar_enqueue_email(
        'annual_review.reviewer_removed', v_locked_resp.reviewer_id,
        jsonb_build_object('instance_id', p_instance_id, 'role', p_role, 'reason', p_reason)
      );
      PERFORM public.archive_annual_review_response(
        v_locked_resp.id, 'ADR-160: reviewer superseded — ' || COALESCE(p_reason,'')
      );
    END IF;

    -- FIX: explicit role → status mapping (enum uses short forms)
    v_target_status := (CASE p_role
        WHEN 'manager'      THEN 'pending_manager'
        WHEN 'skip_manager' THEN 'pending_skip'
        WHEN 'dept_head'    THEN 'pending_dept'
        WHEN 'bu_head'      THEN 'pending_bu'
        WHEN 'hr'           THEN 'pending_hr'
        WHEN 'management'   THEN 'pending_management'
    END)::public.annual_review_status;
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

  UPDATE public.annual_review_instances
     SET manager_id     = CASE WHEN p_role = 'manager'      THEN p_new_reviewer_id ELSE manager_id END,
         skip_id        = CASE WHEN p_role = 'skip_manager' THEN p_new_reviewer_id ELSE skip_id END,
         dept_head_id   = CASE WHEN p_role = 'dept_head'    THEN p_new_reviewer_id ELSE dept_head_id END,
         bu_head_id     = CASE WHEN p_role = 'bu_head'      THEN p_new_reviewer_id ELSE bu_head_id END,
         hr_id          = CASE WHEN p_role = 'hr'           THEN p_new_reviewer_id ELSE hr_id END,
         management_id  = CASE WHEN p_role = 'management'   THEN p_new_reviewer_id ELSE management_id END,
         overall_status = CASE WHEN p_mode = 'supersede' THEN v_target_status ELSE overall_status END,
         final_rating            = CASE WHEN v_was_completed AND p_mode = 'supersede' THEN NULL ELSE final_rating END,
         total_score             = CASE WHEN v_was_completed AND p_mode = 'supersede' THEN NULL ELSE total_score END,
         criteria_weighted_score = CASE WHEN v_was_completed AND p_mode = 'supersede' THEN NULL ELSE criteria_weighted_score END,
         finalized_at            = CASE WHEN v_was_completed AND p_mode = 'supersede' THEN NULL ELSE finalized_at END,
         has_admin_workflow_override = true,
         updated_at = now()
   WHERE id = p_instance_id;

  INSERT INTO public.system_audit_logs(action, performed_by, metadata)
  VALUES (
    CASE WHEN p_mode = 'supersede' THEN 'annual_review.reviewer_reassigned_supersede' ELSE 'annual_review.reviewer_reassigned' END,
    auth.uid(),
    jsonb_build_object(
      'instance_id', p_instance_id, 'role', p_role,
      'old_reviewer_id', v_old_reviewer, 'new_reviewer_id', p_new_reviewer_id,
      'mode', p_mode, 'reason', p_reason,
      'target_status', v_target_status
    )
  );

  IF v_was_completed AND p_mode = 'supersede' THEN
    INSERT INTO public.annual_review_access_audit(action, actor_id, target_id, metadata)
    VALUES (
      'workflow_reopened_from_completed', auth.uid(), p_instance_id,
      jsonb_build_object('prior_status','completed','new_status',v_target_status,'mode',p_mode,'reason',p_reason,'source','reassign_annual_review_reviewer','role',p_role)
    );
  END IF;

  RETURN v_override;
END; $function$;
