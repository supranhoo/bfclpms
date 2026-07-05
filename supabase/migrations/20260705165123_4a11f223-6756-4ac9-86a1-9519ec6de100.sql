-- Tolerant step-back for annual-review admin: re-anchor when overall_status
-- points at a stage that is no longer in enabled_stages (data drift).

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

  -- Non-admin: caller must be the active reviewer for the requested stage.
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

  -- Admin drift-tolerance: if the requested role isn't in the effective chain,
  -- add it temporarily so prev_role can compute the correct enabled predecessor.
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
END $$;

GRANT EXECUTE ON FUNCTION public.send_back_annual_review_status(uuid, public.annual_reviewer_role, text) TO authenticated;

COMMENT ON FUNCTION public.send_back_annual_review_status IS
  'Steps an annual-review instance back one stage. Admin/HR PMS tolerate drift: if the requested stage is not in the current enabled_stages, the previous stage is resolved from the effective enabled chain.';

-- One-time reconciliation: snap overall_status back to the last enabled stage
-- for any instance whose overall_status points at a stage that is not enabled.
DO $$
DECLARE
  r record;
  v_last_stage text;
  v_new_status public.annual_review_status;
BEGIN
  FOR r IN
    SELECT id, overall_status, enabled_stages
      FROM public.annual_review_instances
     WHERE overall_status::text LIKE 'pending_%'
       AND overall_status <> 'pending_self'
       AND NOT (
         enabled_stages ? CASE overall_status::text
           WHEN 'pending_manager' THEN 'manager'
           WHEN 'pending_skip'    THEN 'skip_manager'
           WHEN 'pending_dept'    THEN 'dept_head'
           WHEN 'pending_bu'      THEN 'bu_head'
           WHEN 'pending_hr'      THEN 'hr'
         END
       )
  LOOP
    SELECT s INTO v_last_stage
      FROM (VALUES ('self',1),('manager',2),('skip_manager',3),
                   ('dept_head',4),('bu_head',5),('hr',6)) AS t(s,ord)
     WHERE r.enabled_stages ? s
     ORDER BY ord DESC
     LIMIT 1;

    v_new_status := (CASE v_last_stage
      WHEN 'self'         THEN 'pending_self'
      WHEN 'manager'      THEN 'pending_manager'
      WHEN 'skip_manager' THEN 'pending_skip'
      WHEN 'dept_head'    THEN 'pending_dept'
      WHEN 'bu_head'      THEN 'pending_bu'
      WHEN 'hr'           THEN 'pending_hr'
    END)::public.annual_review_status;

    UPDATE public.annual_review_instances
       SET overall_status = v_new_status, updated_at = now()
     WHERE id = r.id;

    INSERT INTO public.system_audit_logs(action, performed_by, metadata)
    VALUES ('annual_review.reconcile_overall_status', NULL, jsonb_build_object(
      'instance_id', r.id,
      'from_status', r.overall_status,
      'to_status', v_new_status,
      'enabled_stages', r.enabled_stages,
      'reason', 'overall_status pointed at disabled stage'
    ));
  END LOOP;
END $$;