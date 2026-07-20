
-- ADR-129: Rollback lands on effective terminal stage.
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
  v_stages jsonb;
  v_terminal_stage text;
  v_new_status public.annual_review_status;
  v_unlocked int;
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
  v_stages := COALESCE(to_jsonb(v_inst.enabled_stages), '[]'::jsonb);

  IF jsonb_array_length(v_stages) = 0 THEN
    RAISE EXCEPTION 'enabled_stages missing on instance %', p_instance_id;
  END IF;

  -- Highest-seniority stage present in enabled_stages.
  IF v_stages ? 'hr' THEN
    v_terminal_stage := 'hr'; v_new_status := 'pending_hr';
  ELSIF v_stages ? 'bu_head' THEN
    v_terminal_stage := 'bu_head'; v_new_status := 'pending_bu';
  ELSIF v_stages ? 'dept_head' THEN
    v_terminal_stage := 'dept_head'; v_new_status := 'pending_dept';
  ELSIF v_stages ? 'skip_manager' THEN
    v_terminal_stage := 'skip_manager'; v_new_status := 'pending_skip';
  ELSIF v_stages ? 'manager' THEN
    v_terminal_stage := 'manager'; v_new_status := 'pending_manager';
  ELSE
    RAISE EXCEPTION 'instance % has no reviewer stage to roll back to (enabled_stages=%)',
      p_instance_id, v_stages;
  END IF;

  -- Unlock terminal-stage response so the actual last reviewer can revise.
  UPDATE public.annual_review_responses
     SET is_locked = false,
         submitted_at = NULL,
         notes = COALESCE(p_reason, notes)
   WHERE instance_id = p_instance_id
     AND reviewer_role = v_terminal_stage::public.annual_reviewer_role;
  GET DIAGNOSTICS v_unlocked = ROW_COUNT;

  IF v_unlocked = 0 THEN
    RAISE EXCEPTION 'terminal response (%) missing for instance %; cannot roll back cleanly',
      v_terminal_stage, p_instance_id;
  END IF;

  UPDATE public.annual_review_instances
     SET overall_status = v_new_status,
         final_rating   = NULL,
         hr_remarks     = NULL,
         finalized_at   = NULL,
         finalized_by   = NULL,
         total_score    = NULL,
         criteria_weighted_score = NULL,
         updated_at     = now()
   WHERE id = p_instance_id;

  INSERT INTO public.system_audit_logs(action, performed_by, metadata)
  VALUES ('annual_review.rollback_finalized', v_caller, jsonb_build_object(
    'instance_id', p_instance_id,
    'from_status', v_from_status,
    'to_status',   v_new_status,
    'terminal_stage', v_terminal_stage,
    'reason',      p_reason,
    'previous_final_rating', v_inst.final_rating,
    'previous_finalized_at', v_inst.finalized_at,
    'previous_finalized_by', v_inst.finalized_by
  ));

  RETURN v_new_status;
END $$;

GRANT EXECUTE ON FUNCTION public.rollback_annual_review_completed(uuid, text) TO authenticated;

COMMENT ON FUNCTION public.rollback_annual_review_completed IS
  'ADR-129: Rolls a completed instance back to the actual terminal stage from enabled_stages (HR when present, else BU, else Dept, else Skip, else Manager). Unlocks the terminal-stage response, nulls final rating/HR remarks/finalized_at/finalized_by/total_score/criteria_weighted_score, and audit-logs the reason. Admin / HR PMS only.';

-- One-shot repair for instances stranded by the old RPC (pending_hr without HR
-- in enabled_stages). Unlocks the actual terminal-stage response and moves the
-- instance to the matching pending_* status.
DO $$
DECLARE
  r record;
  v_terminal text;
  v_status public.annual_review_status;
  v_stages jsonb;
BEGIN
  FOR r IN
    SELECT id, enabled_stages, overall_status
      FROM public.annual_review_instances
     WHERE overall_status = 'pending_hr'
       AND NOT (COALESCE(to_jsonb(enabled_stages), '[]'::jsonb) ? 'hr')
  LOOP
    v_stages := COALESCE(to_jsonb(r.enabled_stages), '[]'::jsonb);
    IF v_stages ? 'bu_head' THEN
      v_terminal := 'bu_head'; v_status := 'pending_bu';
    ELSIF v_stages ? 'dept_head' THEN
      v_terminal := 'dept_head'; v_status := 'pending_dept';
    ELSIF v_stages ? 'skip_manager' THEN
      v_terminal := 'skip_manager'; v_status := 'pending_skip';
    ELSIF v_stages ? 'manager' THEN
      v_terminal := 'manager'; v_status := 'pending_manager';
    ELSE
      CONTINUE;
    END IF;

    UPDATE public.annual_review_responses
       SET is_locked = false, submitted_at = NULL
     WHERE instance_id = r.id
       AND reviewer_role = v_terminal::public.annual_reviewer_role;

    UPDATE public.annual_review_instances
       SET overall_status = v_status, updated_at = now()
     WHERE id = r.id;

    INSERT INTO public.system_audit_logs(action, performed_by, metadata)
    VALUES ('annual_review.rollback_repair_terminal_stage', NULL, jsonb_build_object(
      'instance_id', r.id,
      'from_status', r.overall_status,
      'to_status',   v_status,
      'terminal_stage', v_terminal,
      'adr', 'ADR-129'
    ));
  END LOOP;
END $$;

-- Security finding: restrict incentive_slabs SELECT to admin/hr_pms/management.
DROP POLICY IF EXISTS "Authenticated can view incentive_slabs" ON public.incentive_slabs;

CREATE POLICY "Privileged roles can view incentive_slabs"
  ON public.incentive_slabs FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'hr_pms'::public.app_role)
    OR public.has_role(auth.uid(), 'management'::public.app_role)
    OR public.has_menu_access_override(auth.uid(), 'admin-incentive'::text)
  );
