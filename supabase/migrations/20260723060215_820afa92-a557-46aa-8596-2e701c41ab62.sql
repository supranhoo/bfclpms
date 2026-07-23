-- ADR-137: Duplicate-reviewer collapse — mirror lock onto surviving terminal stage.
-- When advance_annual_review_status resolves next_status to 'completed' because
-- the just-submitted stage was deduped away in favour of a higher stage held by
-- the SAME reviewer, mirror the locked response onto the surviving terminal
-- role so the ADR-127b completion guard sees evidence.

CREATE OR REPLACE FUNCTION public.advance_annual_review_status(p_instance_id uuid, p_reviewer_role annual_reviewer_role)
RETURNS annual_review_status
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  v_inst public.annual_review_instances%ROWTYPE;
  v_caller uuid := auth.uid();
  v_effective jsonb;
  v_skipped jsonb;
  v_next public.annual_review_status;
  v_orig_enabled jsonb;
  v_is_admin boolean := public.has_role(v_caller,'admin') OR public.has_role(v_caller,'hr_pms');
  v_weighted numeric;
  v_summary  RECORD;
  v_terminal_role text;
  v_terminal_reviewer uuid;
  v_src_row public.annual_review_responses%ROWTYPE;
BEGIN
  SELECT * INTO v_inst FROM public.annual_review_instances WHERE id = p_instance_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'instance % not found', p_instance_id; END IF;

  IF v_inst.overall_status = 'excluded' THEN
    RAISE EXCEPTION 'instance is excluded from this cycle and cannot be submitted';
  END IF;

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

  v_weighted := public.compute_annual_review_weighted_score(p_instance_id, p_reviewer_role);

  UPDATE public.annual_review_responses
     SET is_locked = true,
         submitted_at = COALESCE(submitted_at, now()),
         weighted_score = COALESCE(v_weighted, weighted_score)
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

  -- ADR-137: Duplicate-reviewer collapse mirror.
  -- If we're transitioning to 'completed' but the submitted role isn't the
  -- effective terminal role, and the terminal role is held by the same caller
  -- (duplicate-reviewer collapse), mirror the just-locked response onto the
  -- surviving terminal role so the ADR-127b guard sees evidence.
  IF v_next = 'completed' THEN
    SELECT stage::text INTO v_terminal_role
      FROM public.annual_review_effective_chain_details(p_instance_id) d
      JOIN (VALUES ('self',1),('manager',2),('skip_manager',3),
                   ('dept_head',4),('bu_head',5),('hr',6)) t(s, ord)
        ON t.s = d.stage::text
     WHERE NOT d.skipped
     ORDER BY ord DESC
     LIMIT 1;

    IF v_terminal_role IS NOT NULL AND v_terminal_role <> p_reviewer_role::text THEN
      v_terminal_reviewer := CASE v_terminal_role
        WHEN 'manager'      THEN v_inst.manager_id
        WHEN 'skip_manager' THEN v_inst.skip_id
        WHEN 'dept_head'    THEN v_inst.dept_head_id
        WHEN 'bu_head'      THEN v_inst.bu_head_id
        WHEN 'hr'           THEN v_inst.hr_id
        ELSE NULL
      END;

      -- Safety: only mirror when the terminal reviewer equals the caller who
      -- just submitted. Otherwise raise so the collapse is not silently
      -- attributed to the wrong person.
      IF v_terminal_reviewer IS NULL OR v_terminal_reviewer <> v_caller THEN
        RAISE EXCEPTION 'ADR-137: cannot mirror % submission to terminal stage % — terminal reviewer differs from caller',
          p_reviewer_role, v_terminal_role
          USING ERRCODE = 'check_violation';
      END IF;

      SELECT * INTO v_src_row
        FROM public.annual_review_responses
       WHERE instance_id = p_instance_id AND reviewer_role = p_reviewer_role
       LIMIT 1;

      INSERT INTO public.annual_review_responses (
        instance_id, reviewer_role, reviewer_id,
        criteria_scores, weighted_score, comments,
        is_locked, submitted_at
      )
      VALUES (
        p_instance_id, v_terminal_role::public.annual_reviewer_role, v_caller,
        COALESCE(v_src_row.criteria_scores, '{}'::jsonb),
        v_src_row.weighted_score,
        v_src_row.comments,
        true, now()
      )
      ON CONFLICT (instance_id, reviewer_role) DO UPDATE
        SET reviewer_id     = EXCLUDED.reviewer_id,
            criteria_scores = EXCLUDED.criteria_scores,
            weighted_score  = EXCLUDED.weighted_score,
            comments        = COALESCE(public.annual_review_responses.comments, EXCLUDED.comments),
            is_locked       = true,
            submitted_at    = COALESCE(public.annual_review_responses.submitted_at, now());

      INSERT INTO public.system_audit_logs(action, performed_by, metadata)
      VALUES ('annual_review.duplicate_reviewer_mirror', v_caller, jsonb_build_object(
        'instance_id',  p_instance_id,
        'from_role',    p_reviewer_role,
        'to_role',      v_terminal_role,
        'reviewer_id',  v_caller
      ));
    END IF;
  END IF;

  -- ADR-124: when the terminal stage is reached and HR has NOT already
  -- populated the final summary, compute + persist it here. HR still wins:
  -- if criteria_weighted_score is already non-NULL, we do not overwrite.
  IF v_next = 'completed'
     AND v_inst.criteria_weighted_score IS NULL THEN
    SELECT * INTO v_summary
      FROM public.annual_review_compute_final_summary(p_instance_id);

    UPDATE public.annual_review_instances
       SET overall_status           = v_next,
           finalized_at             = now(),
           finalized_by             = v_caller,
           criteria_weighted_score  = v_summary.criteria_weighted_score,
           total_score              = v_summary.total_score,
           final_rating             = v_summary.final_rating,
           updated_at               = now()
     WHERE id = p_instance_id;

    INSERT INTO public.system_audit_logs(action, performed_by, metadata)
    VALUES ('annual_review.terminal_auto_finalized', v_caller, jsonb_build_object(
      'instance_id',              p_instance_id,
      'terminal_stage',           p_reviewer_role,
      'criteria_weighted_score',  v_summary.criteria_weighted_score,
      'total_score',              v_summary.total_score,
      'final_rating',             v_summary.final_rating
    ));
  ELSE
    UPDATE public.annual_review_instances
       SET overall_status = v_next,
           finalized_at = CASE WHEN v_next = 'completed' THEN COALESCE(finalized_at, now()) ELSE finalized_at END,
           finalized_by = CASE WHEN v_next = 'completed' THEN COALESCE(finalized_by, v_caller) ELSE finalized_by END,
           updated_at = now()
     WHERE id = p_instance_id;
  END IF;

  RETURN v_next;
END $function$;

COMMENT ON FUNCTION public.advance_annual_review_status(uuid, public.annual_reviewer_role) IS
'ADR-137: when the caller submits a lower stage that gets deduped away by the effective-chain (same reviewer holds a higher stage), mirror the locked response onto the surviving terminal role so ADR-127b completion guard passes.';

-- Data repair: normalize currently-pending instances where the pending role's
-- reviewer is the same person as a downstream, higher-seniority role. Drop
-- the redundant lower stage and forward overall_status to the winning role.
DO $$
DECLARE
  r record;
  v_new_enabled jsonb;
  v_new_status public.annual_review_status;
BEGIN
  -- dept_head == bu_head, currently pending at dept
  FOR r IN
    SELECT id, enabled_stages
      FROM public.annual_review_instances
     WHERE overall_status = 'pending_dept'
       AND dept_head_id IS NOT NULL
       AND dept_head_id = bu_head_id
       AND enabled_stages ? 'dept_head'
       AND enabled_stages ? 'bu_head'
  LOOP
    v_new_enabled := r.enabled_stages - 'dept_head';
    v_new_status  := 'pending_bu'::public.annual_review_status;
    UPDATE public.annual_review_instances
       SET enabled_stages = v_new_enabled,
           overall_status = v_new_status,
           updated_at = now()
     WHERE id = r.id;
    INSERT INTO public.system_audit_logs(action, performed_by, metadata)
    VALUES ('annual_review.bu_terminal_normalized', NULL, jsonb_build_object(
      'instance_id', r.id, 'stripped', 'dept_head', 'forwarded_to', 'pending_bu'));
  END LOOP;

  -- skip_manager == dept_head, pending at skip
  FOR r IN
    SELECT id, enabled_stages
      FROM public.annual_review_instances
     WHERE overall_status = 'pending_skip'
       AND skip_id IS NOT NULL
       AND skip_id = dept_head_id
       AND enabled_stages ? 'skip_manager'
       AND enabled_stages ? 'dept_head'
  LOOP
    v_new_enabled := r.enabled_stages - 'skip_manager';
    UPDATE public.annual_review_instances
       SET enabled_stages = v_new_enabled,
           overall_status = 'pending_dept'::public.annual_review_status,
           updated_at = now()
     WHERE id = r.id;
    INSERT INTO public.system_audit_logs(action, performed_by, metadata)
    VALUES ('annual_review.bu_terminal_normalized', NULL, jsonb_build_object(
      'instance_id', r.id, 'stripped', 'skip_manager', 'forwarded_to', 'pending_dept'));
  END LOOP;

  -- manager == skip_manager, pending at manager
  FOR r IN
    SELECT id, enabled_stages
      FROM public.annual_review_instances
     WHERE overall_status = 'pending_manager'
       AND manager_id IS NOT NULL
       AND manager_id = skip_id
       AND enabled_stages ? 'manager'
       AND enabled_stages ? 'skip_manager'
  LOOP
    v_new_enabled := r.enabled_stages - 'manager';
    UPDATE public.annual_review_instances
       SET enabled_stages = v_new_enabled,
           overall_status = 'pending_skip'::public.annual_review_status,
           updated_at = now()
     WHERE id = r.id;
    INSERT INTO public.system_audit_logs(action, performed_by, metadata)
    VALUES ('annual_review.bu_terminal_normalized', NULL, jsonb_build_object(
      'instance_id', r.id, 'stripped', 'manager', 'forwarded_to', 'pending_skip'));
  END LOOP;

  -- bu_head == hr, pending at bu
  FOR r IN
    SELECT id, enabled_stages
      FROM public.annual_review_instances
     WHERE overall_status = 'pending_bu'
       AND bu_head_id IS NOT NULL
       AND bu_head_id = hr_id
       AND enabled_stages ? 'bu_head'
       AND enabled_stages ? 'hr'
  LOOP
    v_new_enabled := r.enabled_stages - 'bu_head';
    UPDATE public.annual_review_instances
       SET enabled_stages = v_new_enabled,
           overall_status = 'pending_hr'::public.annual_review_status,
           updated_at = now()
     WHERE id = r.id;
    INSERT INTO public.system_audit_logs(action, performed_by, metadata)
    VALUES ('annual_review.bu_terminal_normalized', NULL, jsonb_build_object(
      'instance_id', r.id, 'stripped', 'bu_head', 'forwarded_to', 'pending_hr'));
  END LOOP;
END $$;