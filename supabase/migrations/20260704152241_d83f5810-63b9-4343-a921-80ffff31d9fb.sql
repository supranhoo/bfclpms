-- Fix: send_back to self must clear proxy state (submitted_via_proxy / proxy_submission_id).
-- The historical proxy audit row in annual_review_proxy_submissions is preserved.

CREATE OR REPLACE FUNCTION public.send_back_annual_review_status(
  p_instance_id uuid,
  p_reviewer_role public.annual_reviewer_role,
  p_reason text DEFAULT NULL
)
RETURNS public.annual_review_status
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v_inst   public.annual_review_instances%ROWTYPE;
  v_caller uuid := auth.uid();
  v_effective jsonb;
  v_prev   public.annual_review_status;
  v_prev_role public.annual_reviewer_role;
  v_is_admin boolean := public.has_role(v_caller,'admin') OR public.has_role(v_caller,'hr_pms');
BEGIN
  SELECT * INTO v_inst FROM public.annual_review_instances WHERE id = p_instance_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'instance % not found', p_instance_id; END IF;

  IF p_reviewer_role = 'self' THEN
    RAISE EXCEPTION 'self stage has no previous stage to send back to';
  END IF;
  IF NOT (v_inst.enabled_stages ? p_reviewer_role::text) THEN
    RAISE EXCEPTION 'stage % is not enabled for this instance', p_reviewer_role;
  END IF;

  IF NOT v_is_admin THEN
    IF (p_reviewer_role = 'manager'      AND (v_inst.manager_id   <> v_caller OR v_inst.overall_status <> 'pending_manager')) OR
       (p_reviewer_role = 'skip_manager' AND (v_inst.skip_id      <> v_caller OR v_inst.overall_status <> 'pending_skip'))    OR
       (p_reviewer_role = 'dept_head'    AND (v_inst.dept_head_id <> v_caller OR v_inst.overall_status <> 'pending_dept'))    OR
       (p_reviewer_role = 'bu_head'      AND (v_inst.bu_head_id   <> v_caller OR v_inst.overall_status <> 'pending_bu'))      OR
       (p_reviewer_role = 'hr'           AND (v_inst.hr_id        <> v_caller OR v_inst.overall_status <> 'pending_hr'))
    THEN RAISE EXCEPTION 'caller is not the active reviewer for stage %', p_reviewer_role;
    END IF;
  END IF;

  v_effective := public.annual_review_effective_chain(p_instance_id);
  v_prev      := public.annual_review_prev_status(v_effective, p_reviewer_role);
  v_prev_role := public.annual_review_prev_role(v_effective, p_reviewer_role);

  UPDATE public.annual_review_responses
     SET is_locked = false, submitted_at = NULL, notes = COALESCE(p_reason, notes)
   WHERE instance_id = p_instance_id AND reviewer_role = v_prev_role;

  UPDATE public.annual_review_instances
     SET overall_status = v_prev,
         submitted_via_proxy = CASE WHEN v_prev_role = 'self' THEN false ELSE submitted_via_proxy END,
         proxy_submission_id = CASE WHEN v_prev_role = 'self' THEN NULL  ELSE proxy_submission_id END,
         updated_at = now()
   WHERE id = p_instance_id;

  INSERT INTO public.system_audit_logs(action, performed_by, metadata)
  VALUES ('annual_review.send_back', v_caller, jsonb_build_object(
    'instance_id', p_instance_id,
    'from_stage', p_reviewer_role,
    'to_stage', v_prev_role,
    'reason', p_reason,
    'cleared_proxy_state', (v_prev_role = 'self')
  ));

  RETURN v_prev;
END $$;

GRANT EXECUTE ON FUNCTION public.send_back_annual_review_status(uuid, public.annual_reviewer_role, text) TO authenticated;

-- One-time repair: clear proxy state on instances already returned to self-review.
UPDATE public.annual_review_instances
   SET submitted_via_proxy = false,
       proxy_submission_id = NULL,
       updated_at = now()
 WHERE overall_status = 'pending_self'
   AND submitted_via_proxy = true;