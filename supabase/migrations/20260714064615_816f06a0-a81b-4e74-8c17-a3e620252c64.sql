-- 1) Recreate send_back RPC as SECURITY DEFINER (body unchanged).
CREATE OR REPLACE FUNCTION public.send_back_annual_review_status(
  p_instance_id uuid,
  p_reviewer_role annual_reviewer_role,
  p_reason text DEFAULT NULL::text
)
RETURNS annual_review_status
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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

  IF v_inst.overall_status = 'excluded' THEN
    RAISE EXCEPTION 'instance is excluded from this cycle and cannot be sent back';
  END IF;

  IF p_reviewer_role = 'self' THEN
    RAISE EXCEPTION 'self stage has no previous stage to send back to';
  END IF;

  IF NOT v_is_admin THEN
    IF NOT (v_inst.enabled_stages ? p_reviewer_role::text) THEN
      RAISE EXCEPTION 'stage % is not enabled for this instance', p_reviewer_role;
    END IF;
    IF (p_reviewer_role = 'manager'      AND (v_inst.manager_id   <> v_caller OR v_inst.overall_status <> 'pending_manager')) OR
       (p_reviewer_role = 'skip_manager' AND (v_inst.skip_id      <> v_caller OR v_inst.overall_status <> 'pending_skip'))    OR
       (p_reviewer_role = 'dept_head'    AND (v_inst.dept_head_id <> v_caller OR v_inst.overall_status <> 'pending_dept'))    OR
       (p_reviewer_role = 'bu_head'      AND (v_inst.bu_head_id   <> v_caller OR v_inst.overall_status <> 'pending_bu'))      OR
       (p_reviewer_role = 'hr'           AND (v_inst.hr_id        <> v_caller OR v_inst.overall_status <> 'pending_hr'))
    THEN RAISE EXCEPTION 'caller is not the active reviewer for stage %', p_reviewer_role;
    END IF;
  END IF;

  v_effective := public.annual_review_effective_chain(p_instance_id);

  IF v_is_admin AND NOT (v_effective ? p_reviewer_role::text) THEN
    v_effective := v_effective || to_jsonb(p_reviewer_role::text);
  END IF;

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
    'cleared_proxy_state', (v_prev_role = 'self'),
    'drift_reanchored', (NOT (public.annual_review_effective_chain(p_instance_id) ? p_reviewer_role::text))
  ));

  RETURN v_prev;
END $function$;

-- 2) One-shot repair for Abes Raja (emp 200687) — instance 733e4c88-1cba-4a8d-8cbc-cc674ed02a3f
UPDATE public.annual_review_responses
   SET is_locked = false,
       submitted_at = NULL
 WHERE instance_id = '733e4c88-1cba-4a8d-8cbc-cc674ed02a3f'
   AND reviewer_role = 'self'
   AND is_locked = true;

INSERT INTO public.system_audit_logs(action, performed_by, metadata)
VALUES (
  'annual_review.response_repair',
  NULL,
  jsonb_build_object(
    'instance_id', '733e4c88-1cba-4a8d-8cbc-cc674ed02a3f',
    'reviewer_role', 'self',
    'reason', 'Stuck is_locked=true after dept_head send-back on 2026-07-14; RLS blocked auto-unlock before send_back RPC was made SECURITY DEFINER',
    'employee_code', '200687'
  )
);