
-- =====================================================================
-- ADR-142 — Annual Review response rows must follow reviewer reassignment
-- POLICY §AR-RESPONSE-ROLE-CANONICAL
-- =====================================================================

-- 1) Rebind trigger: on any *_id change, keep the (unlocked) response row's
--    reviewer_id in sync with the currently-assigned reviewer for that role.
CREATE OR REPLACE FUNCTION public.enforce_ar_reviewer_response_rebind()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  r RECORD;
  slots CONSTANT text[][] := ARRAY[
    ['manager',      'manager_id'],
    ['skip_manager', 'skip_id'],
    ['dept_head',    'dept_head_id'],
    ['bu_head',      'bu_head_id'],
    ['hr',           'hr_id'],
    ['management',   'management_id']
  ];
  slot_role text;
  old_id uuid;
  new_id uuid;
BEGIN
  FOR i IN 1 .. array_length(slots,1) LOOP
    slot_role := slots[i][1];
    -- read the specific column dynamically from OLD/NEW rows using CASE
    old_id := CASE slot_role
      WHEN 'manager'      THEN OLD.manager_id
      WHEN 'skip_manager' THEN OLD.skip_id
      WHEN 'dept_head'    THEN OLD.dept_head_id
      WHEN 'bu_head'      THEN OLD.bu_head_id
      WHEN 'hr'           THEN OLD.hr_id
      WHEN 'management'   THEN OLD.management_id
    END;
    new_id := CASE slot_role
      WHEN 'manager'      THEN NEW.manager_id
      WHEN 'skip_manager' THEN NEW.skip_id
      WHEN 'dept_head'    THEN NEW.dept_head_id
      WHEN 'bu_head'      THEN NEW.bu_head_id
      WHEN 'hr'           THEN NEW.hr_id
      WHEN 'management'   THEN NEW.management_id
    END;

    IF old_id IS DISTINCT FROM new_id THEN
      -- Rebind or delete the response row IF it is still unlocked.
      -- Locked rows are historical evidence (someone submitted). We leave them
      -- alone: advance-time invariant (below) will detect and block advancement
      -- until an authorized flow (admin/HR) resolves the mismatch.
      FOR r IN
        SELECT id, is_locked, reviewer_id
          FROM public.annual_review_responses
         WHERE instance_id  = NEW.id
           AND reviewer_role = slot_role::public.annual_reviewer_role
      LOOP
        IF r.is_locked THEN
          CONTINUE;
        END IF;

        IF new_id IS NULL THEN
          -- Slot cleared; drop the stray draft.
          DELETE FROM public.annual_review_responses WHERE id = r.id;
        ELSIF r.reviewer_id IS DISTINCT FROM new_id THEN
          UPDATE public.annual_review_responses
             SET reviewer_id = new_id,
                 updated_at  = now()
           WHERE id = r.id;
        END IF;

        INSERT INTO public.annual_review_reviewer_resync_audit(
          instance_id, cycle_id, employee_id, slot, old_user_id, new_user_id,
          reason, source, performed_by
        ) VALUES (
          NEW.id, NEW.cycle_id, NEW.employee_id, slot_role,
          r.reviewer_id, new_id,
          'ADR-142: reviewer slot changed — rebound open response row',
          'trigger:enforce_ar_reviewer_response_rebind',
          COALESCE(auth.uid(), NEW.finalized_by)
        );
      END LOOP;
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ar_reviewer_response_rebind ON public.annual_review_instances;
CREATE TRIGGER trg_ar_reviewer_response_rebind
AFTER UPDATE OF manager_id, skip_id, dept_head_id, bu_head_id, hr_id, management_id
ON public.annual_review_instances
FOR EACH ROW EXECUTE FUNCTION public.enforce_ar_reviewer_response_rebind();


-- 2) Advance guard: refuse to promote off a stage where the currently-assigned
--    reviewer has no locked, non-empty response. Prepend to the existing RPC.
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
  v_sys_cfg jsonb;
  v_sys_total_weight numeric := 0;
  v_slot jsonb;
  v_current_reviewer uuid;
  v_stage_row public.annual_review_responses%ROWTYPE;
  v_stage_scores int;
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
       (p_reviewer_role = 'hr'           AND (v_inst.hr_id        <> v_caller OR v_inst.overall_status <> 'pending_hr')) OR
       (p_reviewer_role = 'management'   AND (v_inst.management_id<> v_caller OR v_inst.overall_status <> 'pending_management'))
    THEN RAISE EXCEPTION 'caller is not the active reviewer for stage %', p_reviewer_role;
    END IF;
  END IF;

  -- ADR-142 invariant: the stage's response row must belong to the current
  -- reviewer and be scored+lockable. Skip for 'self' (employee always writes).
  IF p_reviewer_role <> 'self' THEN
    v_current_reviewer := CASE p_reviewer_role
      WHEN 'manager'      THEN v_inst.manager_id
      WHEN 'skip_manager' THEN v_inst.skip_id
      WHEN 'dept_head'    THEN v_inst.dept_head_id
      WHEN 'bu_head'      THEN v_inst.bu_head_id
      WHEN 'hr'           THEN v_inst.hr_id
      WHEN 'management'   THEN v_inst.management_id
    END;

    SELECT * INTO v_stage_row
      FROM public.annual_review_responses
     WHERE instance_id = p_instance_id AND reviewer_role = p_reviewer_role
     LIMIT 1;

    IF v_current_reviewer IS NOT NULL
       AND v_stage_row.id IS NOT NULL
       AND v_stage_row.reviewer_id IS DISTINCT FROM v_current_reviewer THEN
      RAISE EXCEPTION
        'ADR-142: cannot advance stage % — response belongs to a previous reviewer. Reassignment must rebind before advance (instance %).',
        p_reviewer_role, p_instance_id
        USING ERRCODE = 'check_violation';
    END IF;

    IF v_stage_row.id IS NOT NULL THEN
      v_stage_scores := (
        SELECT count(*) FROM jsonb_object_keys(
          CASE WHEN jsonb_typeof(v_stage_row.criteria_scores) = 'object'
               THEN v_stage_row.criteria_scores
               ELSE '{}'::jsonb END)
      );
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

  IF v_next = 'completed' THEN
    SELECT stage::text INTO v_terminal_role
      FROM public.annual_review_effective_chain_details(p_instance_id) d
      JOIN (VALUES ('self',1),('manager',2),('skip_manager',3),
                   ('dept_head',4),('bu_head',5),('hr',6),('management',7)) t(s, ord)
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
        WHEN 'management'   THEN v_inst.management_id
        ELSE NULL
      END;

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
        criteria_scores, weighted_score, notes,
        is_locked, submitted_at
      )
      VALUES (
        p_instance_id, v_terminal_role::public.annual_reviewer_role, v_caller,
        COALESCE(v_src_row.criteria_scores, '{}'::jsonb),
        v_src_row.weighted_score,
        v_src_row.notes,
        true, now()
      )
      ON CONFLICT (instance_id, reviewer_role) DO UPDATE
        SET reviewer_id     = EXCLUDED.reviewer_id,
            criteria_scores = EXCLUDED.criteria_scores,
            weighted_score  = EXCLUDED.weighted_score,
            notes           = COALESCE(public.annual_review_responses.notes, EXCLUDED.notes),
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

  IF v_next = 'completed'
     AND v_inst.criteria_weighted_score IS NULL THEN

    PERFORM public.hydrate_annual_review_system_scores(p_instance_id);

    SELECT t.sections->'system_scores' INTO v_sys_cfg
      FROM public.annual_review_templates t
     WHERE t.id = COALESCE(v_inst.template_override_id, v_inst.template_id);

    IF v_sys_cfg IS NOT NULL AND jsonb_typeof(v_sys_cfg) = 'array' THEN
      FOR v_slot IN SELECT * FROM jsonb_array_elements(v_sys_cfg) LOOP
        v_sys_total_weight := v_sys_total_weight + COALESCE((v_slot->>'weight')::numeric, 0);
      END LOOP;
    END IF;

    SELECT * INTO v_inst FROM public.annual_review_instances WHERE id = p_instance_id;

    IF v_sys_total_weight > 0
       AND (v_inst.system_scores IS NULL
            OR v_inst.system_scores = '{}'::jsonb
            OR NOT EXISTS (
              SELECT 1 FROM jsonb_each(v_inst.system_scores) e
               WHERE e.value IS NOT NULL
                 AND jsonb_typeof(e.value) = 'number'
                 AND (e.value)::text::numeric > 0
            ))
       AND COALESCE(v_weighted, 0) = 0 THEN
      RAISE EXCEPTION
        'ADR-140: cannot finalize instance % — template requires system scores (weight=%) but no monthly KRA data resolved. Verify monthly KPI data before submitting.',
        p_instance_id, v_sys_total_weight
        USING ERRCODE = 'check_violation';
    END IF;

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
      'final_rating',             v_summary.final_rating,
      'system_scores',            v_inst.system_scores
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


-- 3) Send-back: also rebind the reopened response row to the current reviewer
--    of the previous stage so the person who now owns that slot picks it up.
CREATE OR REPLACE FUNCTION public.send_back_annual_review_status(p_instance_id uuid, p_reviewer_role annual_reviewer_role, p_reason text DEFAULT NULL::text)
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
  v_prev_reviewer uuid;
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

  v_prev_reviewer := CASE v_prev_role
    WHEN 'self'         THEN v_inst.employee_id
    WHEN 'manager'      THEN v_inst.manager_id
    WHEN 'skip_manager' THEN v_inst.skip_id
    WHEN 'dept_head'    THEN v_inst.dept_head_id
    WHEN 'bu_head'      THEN v_inst.bu_head_id
    WHEN 'hr'           THEN v_inst.hr_id
    WHEN 'management'   THEN v_inst.management_id
  END;

  UPDATE public.annual_review_responses
     SET is_locked   = false,
         submitted_at = NULL,
         notes       = COALESCE(p_reason, notes),
         reviewer_id = COALESCE(v_prev_reviewer, reviewer_id)   -- ADR-142
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


-- =====================================================================
-- 4) One-shot repair for 3 known orphaned instances (all empty drafts)
-- =====================================================================
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT resp.id AS response_id,
           resp.instance_id,
           resp.reviewer_id AS old_reviewer,
           inst.dept_head_id AS new_reviewer,
           inst.overall_status,
           inst.cycle_id,
           inst.employee_id
      FROM public.annual_review_responses resp
      JOIN public.annual_review_instances inst ON inst.id = resp.instance_id
     WHERE resp.instance_id IN (
             '806d6da6-d7c4-41cc-a048-d8a11092c8da',  -- 200564 Javed Jafri
             'df4afa30-2295-4d6e-8934-17dd94acc16c',  -- 200824 Ashis Neogi
             'c8d2da8f-9f58-4b81-9a3e-1690102eae0a'   -- 200800 Dharambir Bedia
           )
       AND resp.reviewer_role = 'dept_head'
       AND resp.reviewer_id  <> inst.dept_head_id
       AND resp.is_locked    = false
  LOOP
    UPDATE public.annual_review_responses
       SET reviewer_id = r.new_reviewer,
           updated_at  = now()
     WHERE id = r.response_id;

    INSERT INTO public.annual_review_reviewer_resync_audit(
      instance_id, cycle_id, employee_id, slot, old_user_id, new_user_id,
      reason, source, performed_by
    ) VALUES (
      r.instance_id, r.cycle_id, r.employee_id, 'dept_head',
      r.old_reviewer, r.new_reviewer,
      'ADR-142 one-shot: rebound empty dept_head draft to current reviewer',
      'migration:adr142_repair',
      NULL
    );
  END LOOP;

  -- 200564: instance had been advanced to pending_bu even though no
  -- real dept_head submission existed. Roll it back one stage so the
  -- current dept_head (Y R V S Murthy) can enter scores from scratch.
  UPDATE public.annual_review_instances
     SET overall_status = 'pending_dept',
         updated_at     = now()
   WHERE id = '806d6da6-d7c4-41cc-a048-d8a11092c8da'
     AND overall_status = 'pending_bu';

  INSERT INTO public.system_audit_logs(action, performed_by, metadata)
  VALUES ('annual_review.adr142_stepback', NULL, jsonb_build_object(
    'instance_id',    '806d6da6-d7c4-41cc-a048-d8a11092c8da',
    'employee_code',  '200564',
    'from_status',    'pending_bu',
    'to_status',      'pending_dept',
    'reason',         'ADR-142: dept_head advance had no scored+locked response for current reviewer'
  ));
END $$;
