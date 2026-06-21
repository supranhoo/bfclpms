-- =========================================================================
-- Annual review: duplicate-reviewer auto-skip (top-down de-dup)
-- =========================================================================
-- When the same person is mapped to multiple reviewer slots on an instance
-- (e.g. manager + dept_head + bu_head all = Jaspal), they should review ONCE
-- at the HIGHEST seniority tier. Lower duplicate stages are auto-skipped and
-- logged with skip_reason = 'duplicate_reviewer'.
--
-- Seniority (top → bottom): hr, bu_head, dept_head, skip_manager, manager
-- 'self' is always kept and never participates in the de-dup pass.
--
-- Existing skip rules (no_reviewer_mapped, reviewer_inactive, self_assignment)
-- are preserved and evaluated BEFORE the duplicate check.
-- =========================================================================

-- 1. Details resolver: returns one row per ENABLED stage with skip info -------
CREATE OR REPLACE FUNCTION public.annual_review_effective_chain_details(p_instance_id uuid)
RETURNS TABLE(
  stage        public.annual_reviewer_role,
  reviewer_id  uuid,
  skipped      boolean,
  skip_reason  text,
  duplicate_of public.annual_reviewer_role  -- populated only when skip_reason = 'duplicate_reviewer'
)
LANGUAGE plpgsql STABLE SET search_path = public AS $$
DECLARE
  v_inst public.annual_review_instances%ROWTYPE;
  r record;
  v_kept_ids   uuid[]   := ARRAY[]::uuid[];
  v_kept_stage text[]   := ARRAY[]::text[];
  v_active boolean;
  v_skipped boolean;
  v_reason text;
  v_dup_of text;
  v_idx int;
BEGIN
  SELECT * INTO v_inst FROM public.annual_review_instances WHERE id = p_instance_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'instance % not found', p_instance_id; END IF;

  -- Top-down seniority pass so the HIGHEST tier wins on duplicates.
  FOR r IN
    SELECT s, ord
      FROM (VALUES ('hr',1),('bu_head',2),('dept_head',3),
                   ('skip_manager',4),('manager',5),('self',6)) AS t(s,ord)
     WHERE v_inst.enabled_stages ? s
     ORDER BY ord
  LOOP
    stage       := r.s::public.annual_reviewer_role;
    reviewer_id := CASE r.s
      WHEN 'self'         THEN v_inst.employee_id
      WHEN 'manager'      THEN v_inst.manager_id
      WHEN 'skip_manager' THEN v_inst.skip_id
      WHEN 'dept_head'    THEN v_inst.dept_head_id
      WHEN 'bu_head'      THEN v_inst.bu_head_id
      WHEN 'hr'           THEN v_inst.hr_id
    END;
    skipped := false; skip_reason := NULL; duplicate_of := NULL;

    IF r.s = 'self' THEN
      -- 'self' is always kept; don't add employee_id to the dedup accumulator
      -- (otherwise every reviewer who is also the employee would be flagged
      -- 'duplicate' instead of the more specific 'self_assignment').
      RETURN NEXT;
      CONTINUE;
    END IF;

    IF reviewer_id IS NULL THEN
      v_skipped := true; v_reason := 'no_reviewer_mapped';
    ELSIF reviewer_id = v_inst.employee_id THEN
      v_skipped := true; v_reason := 'self_assignment';
    ELSE
      SELECT is_active INTO v_active FROM public.profiles WHERE id = reviewer_id;
      IF v_active IS DISTINCT FROM true THEN
        v_skipped := true; v_reason := 'reviewer_inactive';
      ELSE
        v_idx := array_position(v_kept_ids, reviewer_id);
        IF v_idx IS NOT NULL THEN
          v_skipped := true; v_reason := 'duplicate_reviewer';
          v_dup_of := v_kept_stage[v_idx];
        ELSE
          v_skipped := false; v_reason := NULL;
          v_kept_ids   := v_kept_ids   || reviewer_id;
          v_kept_stage := v_kept_stage || r.s;
        END IF;
      END IF;
    END IF;

    skipped      := v_skipped;
    skip_reason  := v_reason;
    duplicate_of := CASE WHEN v_dup_of IS NOT NULL THEN v_dup_of::public.annual_reviewer_role ELSE NULL END;
    v_dup_of := NULL;
    RETURN NEXT;
  END LOOP;
END $$;

GRANT EXECUTE ON FUNCTION public.annual_review_effective_chain_details(uuid) TO authenticated;

-- 2. Backward-compatible jsonb resolver layered on top of the details -------
-- Returns stage names in FORWARD execution order (self → ... → hr), excluding
-- skipped stages. Callers (next_status / prev_status) keep their existing
-- contract.
CREATE OR REPLACE FUNCTION public.annual_review_effective_chain(p_instance_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SET search_path = public AS $$
DECLARE v_result jsonb;
BEGIN
  SELECT COALESCE(jsonb_agg(stage ORDER BY ord), '[]'::jsonb) INTO v_result
    FROM public.annual_review_effective_chain_details(p_instance_id) d
    JOIN (VALUES ('self',1),('manager',2),('skip_manager',3),
                 ('dept_head',4),('bu_head',5),('hr',6)) t(s, ord)
      ON t.s = d.stage::text
   WHERE NOT d.skipped;

  -- Safety net: chain must contain at least 'self'.
  IF NOT (v_result ? 'self') THEN
    v_result := '["self"]'::jsonb;
  END IF;
  RETURN v_result;
END $$;

GRANT EXECUTE ON FUNCTION public.annual_review_effective_chain(uuid) TO authenticated;

-- 3. Enrich advance audit with per-stage skip reasons -----------------------
CREATE OR REPLACE FUNCTION public.advance_annual_review_status(
  p_instance_id uuid,
  p_reviewer_role public.annual_reviewer_role
)
RETURNS public.annual_review_status
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v_inst public.annual_review_instances%ROWTYPE;
  v_caller uuid := auth.uid();
  v_effective jsonb;
  v_skipped jsonb;
  v_next public.annual_review_status;
  v_orig_enabled jsonb;
  v_is_admin boolean := public.has_role(v_caller,'admin') OR public.has_role(v_caller,'hr_pms');
BEGIN
  SELECT * INTO v_inst FROM public.annual_review_instances WHERE id = p_instance_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'instance % not found', p_instance_id; END IF;

  IF NOT (v_inst.enabled_stages ? p_reviewer_role::text) THEN
    RAISE EXCEPTION 'stage % is not enabled for this instance', p_reviewer_role;
  END IF;

  IF NOT v_is_admin THEN
    IF (p_reviewer_role = 'self'         AND (v_inst.employee_id  <> v_caller OR v_inst.overall_status <> 'pending_self')) OR
       (p_reviewer_role = 'manager'      AND (v_inst.manager_id   <> v_caller OR v_inst.overall_status <> 'pending_manager')) OR
       (p_reviewer_role = 'skip_manager' AND (v_inst.skip_id      <> v_caller OR v_inst.overall_status <> 'pending_skip')) OR
       (p_reviewer_role = 'dept_head'    AND (v_inst.dept_head_id <> v_caller OR v_inst.overall_status <> 'pending_dept')) OR
       (p_reviewer_role = 'bu_head'      AND (v_inst.bu_head_id   <> v_caller OR v_inst.overall_status <> 'pending_bu')) OR
       (p_reviewer_role = 'hr'           AND (v_inst.hr_id        <> v_caller OR v_inst.overall_status <> 'pending_hr'))
    THEN RAISE EXCEPTION 'caller is not the active reviewer for stage %', p_reviewer_role;
    END IF;
  END IF;

  UPDATE public.annual_review_responses
     SET is_locked = true, submitted_at = COALESCE(submitted_at, now())
   WHERE instance_id = p_instance_id AND reviewer_role = p_reviewer_role;

  v_effective    := public.annual_review_effective_chain(p_instance_id);
  v_orig_enabled := v_inst.enabled_stages;
  v_next         := public.annual_review_next_status(v_effective, v_inst.overall_status);

  IF v_orig_enabled <> v_effective THEN
    SELECT jsonb_agg(jsonb_build_object(
             'stage', stage,
             'reviewer_id', reviewer_id,
             'reason', skip_reason,
             'duplicate_of', duplicate_of))
      INTO v_skipped
      FROM public.annual_review_effective_chain_details(p_instance_id)
     WHERE skipped;

    INSERT INTO public.system_audit_logs(action, performed_by, metadata)
    VALUES ('annual_review.stage_auto_skipped', v_caller, jsonb_build_object(
      'instance_id',     p_instance_id,
      'from_stage',      p_reviewer_role,
      'enabled',         v_orig_enabled,
      'effective',       v_effective,
      'skipped_stages',  COALESCE(v_skipped, '[]'::jsonb),
      'resolved_to',     v_next
    ));
  END IF;

  UPDATE public.annual_review_instances
     SET overall_status = v_next,
         finalized_at = CASE WHEN v_next = 'completed' THEN now() ELSE finalized_at END,
         finalized_by = CASE WHEN v_next = 'completed' THEN v_caller ELSE finalized_by END,
         updated_at = now()
   WHERE id = p_instance_id;
  RETURN v_next;
END $$;

GRANT EXECUTE ON FUNCTION public.advance_annual_review_status(uuid, public.annual_reviewer_role) TO authenticated;

COMMENT ON FUNCTION public.annual_review_effective_chain_details(uuid) IS
  'Per-stage resolution for an annual review instance. Skip rules evaluated in this order: no_reviewer_mapped → self_assignment → reviewer_inactive → duplicate_reviewer. Duplicate detection runs top-down by seniority (hr → bu_head → dept_head → skip_manager → manager) so the HIGHEST tier wins when the same person is mapped to multiple slots. The self stage is always kept and never deduped.';