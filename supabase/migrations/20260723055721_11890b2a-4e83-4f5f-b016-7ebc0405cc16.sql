-- ADR-136: Evidence-based terminal-stage resolver for rollback_annual_review_completed.
-- Amends ADR-129. Terminal stage = highest-seniority role that is BOTH in
-- enabled_stages AND has a response row on the instance.

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
  v_enabled_terminal_stage text;
  v_terminal_stage text;
  v_new_status public.annual_review_status;
  v_present_roles text[];
  v_unlocked int;
  v_candidate text;
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

  -- What the old (enabled-only) resolver would have said, for the audit trail.
  IF v_stages ? 'hr' THEN v_enabled_terminal_stage := 'hr';
  ELSIF v_stages ? 'bu_head' THEN v_enabled_terminal_stage := 'bu_head';
  ELSIF v_stages ? 'dept_head' THEN v_enabled_terminal_stage := 'dept_head';
  ELSIF v_stages ? 'skip_manager' THEN v_enabled_terminal_stage := 'skip_manager';
  ELSIF v_stages ? 'manager' THEN v_enabled_terminal_stage := 'manager';
  ELSE
    RAISE EXCEPTION 'instance % has no reviewer stage to roll back to (enabled_stages=%)',
      p_instance_id, v_stages;
  END IF;

  -- Reviewer roles that actually have a response row on this instance.
  SELECT COALESCE(array_agg(DISTINCT reviewer_role::text), ARRAY[]::text[])
    INTO v_present_roles
    FROM public.annual_review_responses
   WHERE instance_id = p_instance_id
     AND reviewer_role::text <> 'self';

  -- Evidence-based pick: highest-seniority stage that is in enabled_stages
  -- AND has a response row present.
  v_terminal_stage := NULL;
  FOREACH v_candidate IN ARRAY ARRAY['hr','bu_head','dept_head','skip_manager','manager']::text[] LOOP
    IF (v_stages ? v_candidate) AND (v_candidate = ANY(v_present_roles)) THEN
      v_terminal_stage := v_candidate;
      EXIT;
    END IF;
  END LOOP;

  IF v_terminal_stage IS NULL THEN
    RAISE EXCEPTION 'no reviewer response found on instance % to roll back to (enabled=%, present=%)',
      p_instance_id, v_stages, v_present_roles;
  END IF;

  v_new_status := CASE v_terminal_stage
    WHEN 'hr'           THEN 'pending_hr'::public.annual_review_status
    WHEN 'bu_head'      THEN 'pending_bu'::public.annual_review_status
    WHEN 'dept_head'    THEN 'pending_dept'::public.annual_review_status
    WHEN 'skip_manager' THEN 'pending_skip'::public.annual_review_status
    WHEN 'manager'      THEN 'pending_manager'::public.annual_review_status
  END;

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
    'enabled_terminal_stage', v_enabled_terminal_stage,
    'present_reviewer_roles', to_jsonb(v_present_roles),
    'reason',      p_reason,
    'previous_final_rating', v_inst.final_rating,
    'previous_finalized_at', v_inst.finalized_at,
    'previous_finalized_by', v_inst.finalized_by,
    'adr', 'ADR-136'
  ));

  RETURN v_new_status;
END $$;

GRANT EXECUTE ON FUNCTION public.rollback_annual_review_completed(uuid, text) TO authenticated;

COMMENT ON FUNCTION public.rollback_annual_review_completed IS
  'ADR-136: Rolls a completed instance back to the highest-seniority reviewer stage that is BOTH in enabled_stages AND has a response row on the instance. Unlocks that response, nulls final rating / HR remarks / finalized_at / finalized_by / total_score / criteria_weighted_score, and audit-logs both the effective and the enabled-only terminal stages. Admin / HR PMS only. Amends ADR-129.';

-- One-shot diagnostic: log every completed instance where the evidence-based
-- resolver would pick a lower stage than the enabled-only resolver — these
-- are the instances the old RPC would have refused to roll back.
DO $$
DECLARE
  r record;
  v_stages jsonb;
  v_enabled_top text;
  v_present_roles text[];
  v_effective text;
  v_candidate text;
BEGIN
  FOR r IN
    SELECT id, enabled_stages
      FROM public.annual_review_instances
     WHERE overall_status = 'completed'
       AND enabled_stages IS NOT NULL
  LOOP
    v_stages := COALESCE(to_jsonb(r.enabled_stages), '[]'::jsonb);

    IF v_stages ? 'hr' THEN v_enabled_top := 'hr';
    ELSIF v_stages ? 'bu_head' THEN v_enabled_top := 'bu_head';
    ELSIF v_stages ? 'dept_head' THEN v_enabled_top := 'dept_head';
    ELSIF v_stages ? 'skip_manager' THEN v_enabled_top := 'skip_manager';
    ELSIF v_stages ? 'manager' THEN v_enabled_top := 'manager';
    ELSE CONTINUE;
    END IF;

    SELECT COALESCE(array_agg(DISTINCT reviewer_role::text), ARRAY[]::text[])
      INTO v_present_roles
      FROM public.annual_review_responses
     WHERE instance_id = r.id
       AND reviewer_role::text <> 'self';

    v_effective := NULL;
    FOREACH v_candidate IN ARRAY ARRAY['hr','bu_head','dept_head','skip_manager','manager']::text[] LOOP
      IF (v_stages ? v_candidate) AND (v_candidate = ANY(v_present_roles)) THEN
        v_effective := v_candidate;
        EXIT;
      END IF;
    END LOOP;

    IF v_effective IS DISTINCT FROM v_enabled_top THEN
      INSERT INTO public.system_audit_logs(action, performed_by, metadata)
      VALUES ('annual_review.rollback_terminal_stage_mismatch', NULL, jsonb_build_object(
        'instance_id', r.id,
        'enabled_terminal_stage', v_enabled_top,
        'effective_terminal_stage', v_effective,
        'present_reviewer_roles', to_jsonb(v_present_roles),
        'enabled_stages', v_stages,
        'adr', 'ADR-136'
      ));
    END IF;
  END LOOP;
END $$;