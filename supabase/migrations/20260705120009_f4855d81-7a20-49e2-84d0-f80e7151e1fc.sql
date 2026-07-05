CREATE OR REPLACE FUNCTION public.rollback_annual_review_completed(
  p_instance_id uuid,
  p_reason      text
)
RETURNS public.annual_review_status
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_inst   public.annual_review_instances%ROWTYPE;
  v_from_status public.annual_review_status;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'authentication required';
  END IF;
  IF NOT (public.has_role(v_caller,'admin') OR public.has_role(v_caller,'hr_pms')) THEN
    RAISE EXCEPTION 'only admin / hr_pms may roll back a finalized annual review';
  END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) < 3 THEN
    RAISE EXCEPTION 'a reason of at least 3 characters is required';
  END IF;

  SELECT * INTO v_inst FROM public.annual_review_instances
   WHERE id = p_instance_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'instance % not found', p_instance_id; END IF;

  IF v_inst.overall_status <> 'completed' THEN
    RAISE EXCEPTION 'only completed / finalized instances can be rolled back (current: %)',
      v_inst.overall_status;
  END IF;

  v_from_status := v_inst.overall_status;

  -- Unlock HR response so HR can re-submit after correction.
  UPDATE public.annual_review_responses
     SET is_locked = false,
         submitted_at = NULL,
         notes = COALESCE(p_reason, notes)
   WHERE instance_id = p_instance_id
     AND reviewer_role = 'hr';

  UPDATE public.annual_review_instances
     SET overall_status = 'pending_hr',
         final_rating   = NULL,
         hr_remarks     = NULL,
         finalized_at   = NULL,
         finalized_by   = NULL,
         updated_at     = now()
   WHERE id = p_instance_id;

  INSERT INTO public.system_audit_logs(action, performed_by, metadata)
  VALUES ('annual_review.rollback_finalized', v_caller, jsonb_build_object(
    'instance_id', p_instance_id,
    'from_status', v_from_status,
    'to_status',   'pending_hr',
    'reason',      p_reason,
    'previous_final_rating', v_inst.final_rating,
    'previous_finalized_at', v_inst.finalized_at,
    'previous_finalized_by', v_inst.finalized_by
  ));

  RETURN 'pending_hr'::public.annual_review_status;
END $$;

GRANT EXECUTE ON FUNCTION public.rollback_annual_review_completed(uuid, text) TO authenticated;

COMMENT ON FUNCTION public.rollback_annual_review_completed IS
  'Rolls a completed/finalized annual_review_instance back to pending_hr. Admin/HR PMS only, reason required, audit-logged. Nulls final_rating/hr_remarks/finalized_at/finalized_by and unlocks the HR response so it can be revised. Further step-back uses send_back_annual_review_status.';
