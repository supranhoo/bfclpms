-- =========================================================================
-- Annual review: Department Head stage + cycle-default chain + auto-skip
-- =========================================================================

-- 1. Cycle-level default workflow chain --------------------------------------
ALTER TABLE public.annual_review_cycles
  ADD COLUMN IF NOT EXISTS default_enabled_stages jsonb NOT NULL
    DEFAULT '["self","manager","skip_manager","dept_head","bu_head","hr"]'::jsonb;

CREATE OR REPLACE FUNCTION public.tg_annual_review_validate_default_enabled_stages()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_bad int;
BEGIN
  IF NEW.default_enabled_stages IS NULL OR jsonb_typeof(NEW.default_enabled_stages) <> 'array' THEN
    RAISE EXCEPTION 'default_enabled_stages must be a JSON array';
  END IF;
  IF NOT (NEW.default_enabled_stages ? 'self') THEN
    RAISE EXCEPTION 'default_enabled_stages must contain "self"';
  END IF;
  SELECT count(*) INTO v_bad
    FROM jsonb_array_elements_text(NEW.default_enabled_stages) x
   WHERE x NOT IN ('self','manager','skip_manager','dept_head','bu_head','hr');
  IF v_bad > 0 THEN
    RAISE EXCEPTION 'default_enabled_stages contains unknown stage';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS annual_review_validate_default_enabled_stages ON public.annual_review_cycles;
CREATE TRIGGER annual_review_validate_default_enabled_stages
  BEFORE INSERT OR UPDATE OF default_enabled_stages ON public.annual_review_cycles
  FOR EACH ROW EXECUTE FUNCTION public.tg_annual_review_validate_default_enabled_stages();

-- 2. Extend the per-instance validator to allow 'dept_head' -------------------
CREATE OR REPLACE FUNCTION public.tg_annual_review_validate_enabled_stages()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE v_bad int;
BEGIN
  IF NEW.enabled_stages IS NULL OR jsonb_typeof(NEW.enabled_stages) <> 'array' THEN
    RAISE EXCEPTION 'enabled_stages must be a JSON array';
  END IF;
  IF NOT (NEW.enabled_stages ? 'self') THEN
    RAISE EXCEPTION 'enabled_stages must contain "self"';
  END IF;
  SELECT count(*) INTO v_bad
    FROM jsonb_array_elements_text(NEW.enabled_stages) x
   WHERE x NOT IN ('self','manager','skip_manager','dept_head','bu_head','hr');
  IF v_bad > 0 THEN
    RAISE EXCEPTION 'enabled_stages contains unknown stage';
  END IF;
  RETURN NEW;
END $$;

-- Update column default to include dept_head (existing rows backfilled below).
ALTER TABLE public.annual_review_instances
  ALTER COLUMN enabled_stages
  SET DEFAULT '["self","manager","skip_manager","dept_head","bu_head","hr"]'::jsonb;

-- 3. Canonical-order helpers (now 6 stages, dept_head between skip and bu) ----
CREATE OR REPLACE FUNCTION public.annual_review_next_status(
  p_enabled jsonb,
  p_current public.annual_review_status
)
RETURNS public.annual_review_status
LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
DECLARE
  v_chain text[];
  v_cur text;
  v_idx int;
BEGIN
  SELECT array_agg(s ORDER BY ord) INTO v_chain
    FROM (VALUES ('self',1),('manager',2),('skip_manager',3),
                 ('dept_head',4),('bu_head',5),('hr',6)) AS t(s,ord)
   WHERE p_enabled ? s;

  v_cur := CASE p_current
    WHEN 'pending_self'    THEN 'self'
    WHEN 'pending_manager' THEN 'manager'
    WHEN 'pending_skip'    THEN 'skip_manager'
    WHEN 'pending_dept'    THEN 'dept_head'
    WHEN 'pending_bu'      THEN 'bu_head'
    WHEN 'pending_hr'      THEN 'hr'
    ELSE NULL
  END;

  IF v_cur IS NULL THEN RETURN p_current; END IF;
  v_idx := array_position(v_chain, v_cur);
  IF v_idx IS NULL OR v_idx >= array_length(v_chain,1) THEN
    RETURN 'completed'::public.annual_review_status;
  END IF;

  RETURN (CASE v_chain[v_idx+1]
    WHEN 'self'         THEN 'pending_self'
    WHEN 'manager'      THEN 'pending_manager'
    WHEN 'skip_manager' THEN 'pending_skip'
    WHEN 'dept_head'    THEN 'pending_dept'
    WHEN 'bu_head'      THEN 'pending_bu'
    WHEN 'hr'           THEN 'pending_hr'
  END)::public.annual_review_status;
END $$;

CREATE OR REPLACE FUNCTION public.annual_review_prev_status(
  p_enabled jsonb,
  p_role public.annual_reviewer_role
)
RETURNS public.annual_review_status
LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
DECLARE
  v_chain text[];
  v_idx int;
BEGIN
  SELECT array_agg(s ORDER BY ord) INTO v_chain
    FROM (VALUES ('self',1),('manager',2),('skip_manager',3),
                 ('dept_head',4),('bu_head',5),('hr',6)) AS t(s,ord)
   WHERE p_enabled ? s;
  v_idx := array_position(v_chain, p_role::text);
  IF v_idx IS NULL OR v_idx <= 1 THEN
    RAISE EXCEPTION 'no previous stage for role %', p_role;
  END IF;
  RETURN (CASE v_chain[v_idx-1]
    WHEN 'self'         THEN 'pending_self'
    WHEN 'manager'      THEN 'pending_manager'
    WHEN 'skip_manager' THEN 'pending_skip'
    WHEN 'dept_head'    THEN 'pending_dept'
    WHEN 'bu_head'      THEN 'pending_bu'
    WHEN 'hr'           THEN 'pending_hr'
  END)::public.annual_review_status;
END $$;

CREATE OR REPLACE FUNCTION public.annual_review_prev_role(
  p_enabled jsonb,
  p_role public.annual_reviewer_role
)
RETURNS public.annual_reviewer_role
LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
DECLARE
  v_chain text[];
  v_idx int;
BEGIN
  SELECT array_agg(s ORDER BY ord) INTO v_chain
    FROM (VALUES ('self',1),('manager',2),('skip_manager',3),
                 ('dept_head',4),('bu_head',5),('hr',6)) AS t(s,ord)
   WHERE p_enabled ? s;
  v_idx := array_position(v_chain, p_role::text);
  IF v_idx IS NULL OR v_idx <= 1 THEN
    RAISE EXCEPTION 'no previous role for %', p_role;
  END IF;
  RETURN v_chain[v_idx-1]::public.annual_reviewer_role;
END $$;

-- 4. Effective-chain resolver: drop stages whose reviewer is null/inactive/self
-- Returns a JSONB array (same shape as enabled_stages) suitable for feeding
-- straight back into annual_review_next_status / annual_review_prev_status.
CREATE OR REPLACE FUNCTION public.annual_review_effective_chain(p_instance_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SET search_path = public AS $$
DECLARE
  v_inst public.annual_review_instances%ROWTYPE;
  v_result jsonb := '[]'::jsonb;
  v_stage text;
  v_reviewer uuid;
  v_active boolean;
BEGIN
  SELECT * INTO v_inst FROM public.annual_review_instances WHERE id = p_instance_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'instance % not found', p_instance_id; END IF;

  FOR v_stage IN
    SELECT s
      FROM (VALUES ('self',1),('manager',2),('skip_manager',3),
                   ('dept_head',4),('bu_head',5),('hr',6)) AS t(s,ord)
     WHERE v_inst.enabled_stages ? s
     ORDER BY ord
  LOOP
    -- self is never auto-skipped (employees can always self-review).
    IF v_stage = 'self' THEN
      v_result := v_result || to_jsonb(v_stage);
      CONTINUE;
    END IF;

    v_reviewer := CASE v_stage
      WHEN 'manager'      THEN v_inst.manager_id
      WHEN 'skip_manager' THEN v_inst.skip_id
      WHEN 'dept_head'    THEN v_inst.dept_head_id
      WHEN 'bu_head'      THEN v_inst.bu_head_id
      WHEN 'hr'           THEN v_inst.hr_id
    END;

    -- skip: null slot
    IF v_reviewer IS NULL THEN CONTINUE; END IF;
    -- skip: self-loop
    IF v_reviewer = v_inst.employee_id THEN CONTINUE; END IF;
    -- skip: inactive reviewer profile
    SELECT is_active INTO v_active FROM public.profiles WHERE id = v_reviewer;
    IF v_active IS DISTINCT FROM true THEN CONTINUE; END IF;

    v_result := v_result || to_jsonb(v_stage);
  END LOOP;

  -- Safety net: chain must contain at least 'self'.
  IF NOT (v_result ? 'self') THEN
    v_result := '["self"]'::jsonb;
  END IF;

  RETURN v_result;
END $$;

GRANT EXECUTE ON FUNCTION public.annual_review_effective_chain(uuid) TO authenticated;

-- 5. Replace advance RPC to use the effective chain ---------------------------
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
  v_next public.annual_review_status;
  v_orig_enabled jsonb;
  v_is_admin boolean := public.has_role(v_caller,'admin') OR public.has_role(v_caller,'hr_pms');
BEGIN
  SELECT * INTO v_inst FROM public.annual_review_instances WHERE id = p_instance_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'instance % not found', p_instance_id; END IF;

  -- Auth gate uses the configured enabled_stages, not the effective chain.
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

  -- Audit if any stage was auto-skipped (enabled but not in effective chain).
  IF v_orig_enabled <> v_effective THEN
    INSERT INTO public.system_audit_logs(action, performed_by, metadata)
    VALUES ('annual_review.stage_auto_skipped', v_caller, jsonb_build_object(
      'instance_id',  p_instance_id,
      'from_stage',   p_reviewer_role,
      'enabled',      v_orig_enabled,
      'effective',    v_effective,
      'resolved_to',  v_next
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

-- 6. Replace send_back RPC to walk the effective chain ------------------------
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
  IF NOT (v_inst.enabled_stages ? p_reviewer_role::text) THEN
    RAISE EXCEPTION 'stage % is not enabled for this instance', p_reviewer_role;
  END IF;

  IF NOT v_is_admin THEN
    IF (p_reviewer_role = 'manager'      AND (v_inst.manager_id   <> v_caller OR v_inst.overall_status <> 'pending_manager')) OR
       (p_reviewer_role = 'skip_manager' AND (v_inst.skip_id      <> v_caller OR v_inst.overall_status <> 'pending_skip'))    OR
       (p_reviewer_role = 'dept_head'    AND (v_inst.dept_head_id <> v_caller OR v_inst.overall_status <> 'pending_dept'))    OR
       (p_reviewer_role = 'bu_head'      AND (v_inst.bu_head_id   <> v_caller OR v_inst.overall_status <> 'pending_bu'))      OR
       (p_reviewer_role = 'hr'           AND (v_inst.hr_id        <> v_caller OR v_inst.overall_status <> 'pending_hr'))
    THEN RAISE EXCEPTION 'caller is not the active reviewer for stage %', p_reviewer_role;
    END IF;
  END IF;

  v_effective := public.annual_review_effective_chain(p_instance_id);
  v_prev      := public.annual_review_prev_status(v_effective, p_reviewer_role);
  v_prev_role := public.annual_review_prev_role(v_effective, p_reviewer_role);

  UPDATE public.annual_review_responses
     SET is_locked = false, submitted_at = NULL, notes = COALESCE(p_reason, notes)
   WHERE instance_id = p_instance_id AND reviewer_role = v_prev_role;

  UPDATE public.annual_review_instances
     SET overall_status = v_prev, updated_at = now()
   WHERE id = p_instance_id;

  INSERT INTO public.system_audit_logs(action, performed_by, metadata)
  VALUES ('annual_review.send_back', v_caller, jsonb_build_object(
    'instance_id', p_instance_id,
    'from_stage', p_reviewer_role,
    'to_stage', v_prev_role,
    'reason', p_reason
  ));

  RETURN v_prev;
END $$;

GRANT EXECUTE ON FUNCTION public.send_back_annual_review_status(uuid, public.annual_reviewer_role, text) TO authenticated;

-- 7. Backfill ----------------------------------------------------------------
-- Active cycles: re-stamp default_enabled_stages so dept_head is included.
UPDATE public.annual_review_cycles
   SET default_enabled_stages = (
     SELECT jsonb_agg(s ORDER BY ord)
       FROM (VALUES ('self',1),('manager',2),('skip_manager',3),
                    ('dept_head',4),('bu_head',5),('hr',6)) t(s,ord)
      WHERE default_enabled_stages ? s OR s = 'dept_head'
   )
 WHERE NOT (default_enabled_stages ? 'dept_head');

-- Active instances: insert dept_head in canonical slot for non-completed rows.
UPDATE public.annual_review_instances
   SET enabled_stages = (
     SELECT jsonb_agg(s ORDER BY ord)
       FROM (VALUES ('self',1),('manager',2),('skip_manager',3),
                    ('dept_head',4),('bu_head',5),('hr',6)) t(s,ord)
      WHERE enabled_stages ? s OR s = 'dept_head'
   )
 WHERE overall_status <> 'completed'
   AND NOT (enabled_stages ? 'dept_head');

COMMENT ON COLUMN public.annual_review_instances.enabled_stages IS
  'JSON array of enabled reviewer roles (subset of self/manager/skip_manager/dept_head/bu_head/hr). Must contain "self". Advance/send-back RPCs walk the effective chain (further dropping stages whose reviewer slot is null, inactive, or equals the employee).';

COMMENT ON COLUMN public.annual_review_cycles.default_enabled_stages IS
  'Cycle-level default workflow chain. Seeder stamps this onto each new instance.enabled_stages. Per-employee overrides via set_annual_review_enabled_stages still win.';