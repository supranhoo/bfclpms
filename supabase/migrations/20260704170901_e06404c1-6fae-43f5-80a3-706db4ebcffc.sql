-- A. SSOT weighted-score helper (mirrors src/lib/annualReview/scoring.ts::computeCriteriaScore)
CREATE OR REPLACE FUNCTION public.compute_annual_review_weighted_score(
  p_instance_id uuid,
  p_reviewer_role public.annual_reviewer_role
) RETURNS numeric
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_scores    jsonb;
  v_criteria  jsonb;
  v_crit      jsonb;
  v_id        text;
  v_weight    numeric;
  v_score     numeric;
  v_stages    jsonb;
  v_total     numeric := 0;
  v_has_stage boolean;
BEGIN
  SELECT r.criteria_scores, t.sections->'criteria'
    INTO v_scores, v_criteria
    FROM public.annual_review_responses r
    JOIN public.annual_review_instances i ON i.id = r.instance_id
    JOIN public.annual_review_templates  t ON t.id = i.template_id
   WHERE r.instance_id = p_instance_id
     AND r.reviewer_role = p_reviewer_role;

  IF v_scores IS NULL OR v_criteria IS NULL OR jsonb_typeof(v_criteria) <> 'array' THEN
    RETURN NULL;
  END IF;

  FOR v_crit IN SELECT * FROM jsonb_array_elements(v_criteria) LOOP
    v_id     := v_crit->>'id';
    v_weight := COALESCE((v_crit->>'weight')::numeric, 0);
    v_stages := v_crit->'reviewer_stages';

    -- If reviewer_stages is present, require this role to be listed.
    IF v_stages IS NOT NULL AND jsonb_typeof(v_stages) = 'array' THEN
      SELECT EXISTS (
        SELECT 1 FROM jsonb_array_elements_text(v_stages) s
         WHERE s = p_reviewer_role::text
      ) INTO v_has_stage;
      IF NOT v_has_stage THEN CONTINUE; END IF;
    END IF;

    IF v_id IS NULL OR NOT (v_scores ? v_id) THEN CONTINUE; END IF;
    BEGIN
      v_score := (v_scores->>v_id)::numeric;
    EXCEPTION WHEN others THEN
      CONTINUE;
    END;
    IF v_score IS NULL THEN CONTINUE; END IF;

    v_total := v_total + (v_weight * v_score);
  END LOOP;

  RETURN v_total;
END $$;

-- B. Persist weighted_score inside advance_annual_review_status
CREATE OR REPLACE FUNCTION public.advance_annual_review_status(
  p_instance_id uuid,
  p_reviewer_role public.annual_reviewer_role
) RETURNS public.annual_review_status
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

  UPDATE public.annual_review_instances
     SET overall_status = v_next,
         finalized_at = CASE WHEN v_next = 'completed' THEN now() ELSE finalized_at END,
         finalized_by = CASE WHEN v_next = 'completed' THEN v_caller ELSE finalized_by END,
         updated_at = now()
   WHERE id = p_instance_id;
  RETURN v_next;
END $function$;

-- C. Fix block_when_annual_cycle_closed: don't reference NEW.employee_id on the responses branch
CREATE OR REPLACE FUNCTION public.block_when_annual_cycle_closed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_cycle_id uuid;
  v_status   text;
  v_caller   uuid := auth.uid();
BEGIN
  -- Admin/HR bypass
  IF v_caller IS NOT NULL AND (public.has_role(v_caller,'admin') OR public.has_role(v_caller,'hr_pms')) THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF TG_TABLE_NAME = 'annual_review_instances' THEN
    -- Employee acknowledgment exemption (instances UPDATE only)
    IF TG_OP = 'UPDATE'
       AND NEW.employee_id = v_caller
       AND NEW.acknowledged_at IS NOT NULL
       AND OLD.acknowledged_at IS NULL
       AND NEW.cycle_id        IS NOT DISTINCT FROM OLD.cycle_id
       AND NEW.template_id     IS NOT DISTINCT FROM OLD.template_id
       AND NEW.overall_status  IS NOT DISTINCT FROM OLD.overall_status
       AND NEW.final_rating    IS NOT DISTINCT FROM OLD.final_rating
       AND NEW.total_score     IS NOT DISTINCT FROM OLD.total_score
    THEN
      RETURN NEW;
    END IF;
    v_cycle_id := COALESCE(NEW.cycle_id, OLD.cycle_id);
  ELSE
    -- responses (or any child table): resolve cycle via instance_id, never touch NEW.employee_id
    SELECT cycle_id INTO v_cycle_id
      FROM public.annual_review_instances
     WHERE id = COALESCE(NEW.instance_id, OLD.instance_id);
  END IF;

  SELECT status INTO v_status FROM public.annual_review_cycles WHERE id = v_cycle_id;
  IF v_status = 'closed' THEN
    RAISE EXCEPTION 'cycle % is closed — no further edits allowed', v_cycle_id;
  END IF;

  RETURN COALESCE(NEW, OLD);
END $function$;

-- D. Backfill: recompute weighted_score for every submitted response that is still NULL
UPDATE public.annual_review_responses r
   SET weighted_score = public.compute_annual_review_weighted_score(r.instance_id, r.reviewer_role)
 WHERE r.is_locked = true
   AND r.weighted_score IS NULL;