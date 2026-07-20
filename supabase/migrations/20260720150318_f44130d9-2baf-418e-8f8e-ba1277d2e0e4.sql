
-- ADR-127b: Inactive reviewers block, never skip.
-- Fixes silent auto-completion when Dept/BU Head is deactivated.

-- Step A: Harden the resolver. Keep the 'reviewer_inactive' diagnosis
-- but do NOT mark the stage as skipped. It stays in the effective chain,
-- forcing admin remap before advancement.
CREATE OR REPLACE FUNCTION public.annual_review_effective_chain_details(p_instance_id uuid)
 RETURNS TABLE(stage annual_reviewer_role, reviewer_id uuid, skipped boolean, skip_reason text, duplicate_of annual_reviewer_role)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
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
        -- ADR-127b: inactive reviewer must NOT collapse the chain.
        -- Keep the stage in the effective chain and record the diagnosis
        -- so the workflow blocks until an admin remaps the reviewer.
        v_skipped := false; v_reason := 'reviewer_inactive';
        v_kept_ids   := v_kept_ids   || reviewer_id;
        v_kept_stage := v_kept_stage || r.s;
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
END $function$;

-- Step B: Completion invariant. Block overall_status='completed' when the
-- terminal stage in the effective chain has no locked response.
CREATE OR REPLACE FUNCTION public.tg_annual_review_guard_completion()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  v_effective jsonb;
  v_terminal text;
  v_has_lock boolean;
BEGIN
  IF NEW.overall_status <> 'completed' OR OLD.overall_status = 'completed' THEN
    RETURN NEW;
  END IF;

  v_effective := public.annual_review_effective_chain(NEW.id);

  SELECT stage::text INTO v_terminal
    FROM public.annual_review_effective_chain_details(NEW.id) d
    JOIN (VALUES ('self',1),('manager',2),('skip_manager',3),
                 ('dept_head',4),('bu_head',5),('hr',6)) t(s, ord)
      ON t.s = d.stage::text
   WHERE NOT d.skipped
   ORDER BY ord DESC
   LIMIT 1;

  IF v_terminal IS NULL OR v_terminal = 'self' THEN
    RETURN NEW;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.annual_review_responses r
     WHERE r.instance_id = NEW.id
       AND r.reviewer_role::text = v_terminal
       AND r.is_locked = true
  ) INTO v_has_lock;

  IF NOT v_has_lock THEN
    RAISE EXCEPTION 'ADR-127b: cannot complete instance % — terminal stage % has no locked response (reviewer likely inactive; admin remap required)',
      NEW.id, v_terminal
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_annual_review_guard_completion ON public.annual_review_instances;
CREATE TRIGGER trg_annual_review_guard_completion
BEFORE UPDATE OF overall_status ON public.annual_review_instances
FOR EACH ROW EXECUTE FUNCTION public.tg_annual_review_guard_completion();

-- Step C: Repair the 4 wrongly auto-completed instances.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT i.id, i.dept_head_id, i.bu_head_id, i.total_score, i.final_rating,
           i.finalized_at, i.finalized_by, i.criteria_weighted_score
      FROM public.annual_review_instances i
     WHERE i.overall_status = 'completed'
       AND i.enabled_stages ? 'dept_head'
       AND NOT EXISTS (SELECT 1 FROM public.annual_review_responses rr
                        WHERE rr.instance_id=i.id AND rr.reviewer_role='dept_head' AND rr.is_locked=true)
       AND NOT EXISTS (SELECT 1 FROM public.annual_review_responses rr
                        WHERE rr.instance_id=i.id AND rr.reviewer_role='bu_head' AND rr.is_locked=true)
  LOOP
    -- Disable the guard for this repair (self->pending_dept, not completed anyway).
    UPDATE public.annual_review_instances
       SET overall_status         = 'pending_dept',
           finalized_at            = NULL,
           finalized_by            = NULL,
           total_score             = NULL,
           final_rating            = NULL,
           criteria_weighted_score = NULL,
           updated_at              = now()
     WHERE id = r.id;

    INSERT INTO public.system_audit_logs(action, performed_by, metadata)
    VALUES ('annual_review.auto_complete_reversal', NULL, jsonb_build_object(
      'instance_id',                r.id,
      'reason',                     'ADR-127b: dept/bu head inactive caused silent auto-complete',
      'prev_total_score',           r.total_score,
      'prev_final_rating',          r.final_rating,
      'prev_finalized_at',          r.finalized_at,
      'prev_criteria_weighted',     r.criteria_weighted_score,
      'inactive_dept_head_id',      r.dept_head_id,
      'inactive_bu_head_id',        r.bu_head_id,
      'new_overall_status',         'pending_dept'
    ));
  END LOOP;
END $$;
