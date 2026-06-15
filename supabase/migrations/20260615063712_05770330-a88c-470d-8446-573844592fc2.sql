-- Per-employee configurable annual review workflow.
-- Adds enabled_stages JSONB to each instance and updates advance/send_back
-- RPCs to use it, plus a new set_annual_review_enabled_stages RPC.

ALTER TABLE public.annual_review_instances
  ADD COLUMN IF NOT EXISTS enabled_stages jsonb NOT NULL
    DEFAULT '["self","manager","skip_manager","bu_head","hr"]'::jsonb;

-- Validate the array via trigger (CHECK constraints don't allow subselects on jsonb_array_elements).
CREATE OR REPLACE FUNCTION public.tg_annual_review_validate_enabled_stages()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_bad int;
BEGIN
  IF NEW.enabled_stages IS NULL OR jsonb_typeof(NEW.enabled_stages) <> 'array' THEN
    RAISE EXCEPTION 'enabled_stages must be a JSON array';
  END IF;
  IF NOT (NEW.enabled_stages ? 'self') THEN
    RAISE EXCEPTION 'enabled_stages must contain "self"';
  END IF;
  SELECT count(*) INTO v_bad
    FROM jsonb_array_elements_text(NEW.enabled_stages) x
   WHERE x NOT IN ('self','manager','skip_manager','bu_head','hr');
  IF v_bad > 0 THEN
    RAISE EXCEPTION 'enabled_stages contains unknown stage';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS annual_review_validate_enabled_stages ON public.annual_review_instances;
CREATE TRIGGER annual_review_validate_enabled_stages
  BEFORE INSERT OR UPDATE OF enabled_stages ON public.annual_review_instances
  FOR EACH ROW EXECUTE FUNCTION public.tg_annual_review_validate_enabled_stages();

-- Helper: given enabled-stages JSON + current pending status, return next status.
CREATE OR REPLACE FUNCTION public.annual_review_next_status(
  p_enabled jsonb,
  p_current public.annual_review_status
)
RETURNS public.annual_review_status
LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
DECLARE
  v_chain text[];
  v_cur   text;
  v_idx   int;
BEGIN
  -- ordered subset of canonical 5-stage chain
  SELECT array_agg(s ORDER BY ord) INTO v_chain
    FROM (VALUES ('self',1),('manager',2),('skip_manager',3),('bu_head',4),('hr',5)) AS t(s,ord)
   WHERE p_enabled ? s;

  v_cur := CASE p_current
    WHEN 'pending_self'    THEN 'self'
    WHEN 'pending_manager' THEN 'manager'
    WHEN 'pending_skip'    THEN 'skip_manager'
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
    FROM (VALUES ('self',1),('manager',2),('skip_manager',3),('bu_head',4),('hr',5)) AS t(s,ord)
   WHERE p_enabled ? s;
  v_idx := array_position(v_chain, p_role::text);
  IF v_idx IS NULL OR v_idx <= 1 THEN
    RAISE EXCEPTION 'no previous stage for role %', p_role;
  END IF;
  RETURN (CASE v_chain[v_idx-1]
    WHEN 'self'         THEN 'pending_self'
    WHEN 'manager'      THEN 'pending_manager'
    WHEN 'skip_manager' THEN 'pending_skip'
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
    FROM (VALUES ('self',1),('manager',2),('skip_manager',3),('bu_head',4),('hr',5)) AS t(s,ord)
   WHERE p_enabled ? s;
  v_idx := array_position(v_chain, p_role::text);
  IF v_idx IS NULL OR v_idx <= 1 THEN
    RAISE EXCEPTION 'no previous role for %', p_role;
  END IF;
  RETURN v_chain[v_idx-1]::public.annual_reviewer_role;
END $$;

-- Replace advance RPC to use enabled_stages.
CREATE OR REPLACE FUNCTION public.advance_annual_review_status(
  p_instance_id uuid,
  p_reviewer_role public.annual_reviewer_role
)
RETURNS public.annual_review_status
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v_inst public.annual_review_instances%ROWTYPE;
  v_caller uuid := auth.uid();
  v_next public.annual_review_status;
  v_is_admin boolean := public.has_role(v_caller,'admin') OR public.has_role(v_caller,'hr_pms');
BEGIN
  SELECT * INTO v_inst FROM public.annual_review_instances WHERE id = p_instance_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'instance % not found', p_instance_id; END IF;

  -- Role must be in the enabled chain for this instance.
  IF NOT (v_inst.enabled_stages ? p_reviewer_role::text) THEN
    RAISE EXCEPTION 'stage % is not enabled for this instance', p_reviewer_role;
  END IF;

  IF NOT v_is_admin THEN
    IF (p_reviewer_role = 'self'         AND (v_inst.employee_id <> v_caller OR v_inst.overall_status <> 'pending_self')) OR
       (p_reviewer_role = 'manager'      AND (v_inst.manager_id  <> v_caller OR v_inst.overall_status <> 'pending_manager')) OR
       (p_reviewer_role = 'skip_manager' AND (v_inst.skip_id     <> v_caller OR v_inst.overall_status <> 'pending_skip')) OR
       (p_reviewer_role = 'bu_head'      AND (v_inst.bu_head_id  <> v_caller OR v_inst.overall_status <> 'pending_bu')) OR
       (p_reviewer_role = 'hr'           AND (v_inst.hr_id       <> v_caller OR v_inst.overall_status <> 'pending_hr'))
    THEN RAISE EXCEPTION 'caller is not the active reviewer for stage %', p_reviewer_role;
    END IF;
  END IF;

  UPDATE public.annual_review_responses
     SET is_locked = true, submitted_at = COALESCE(submitted_at, now())
   WHERE instance_id = p_instance_id AND reviewer_role = p_reviewer_role;

  v_next := public.annual_review_next_status(v_inst.enabled_stages, v_inst.overall_status);

  UPDATE public.annual_review_instances
     SET overall_status = v_next,
         finalized_at = CASE WHEN v_next = 'completed' THEN now() ELSE finalized_at END,
         finalized_by = CASE WHEN v_next = 'completed' THEN v_caller ELSE finalized_by END,
         updated_at = now()
   WHERE id = p_instance_id;
  RETURN v_next;
END $$;

GRANT EXECUTE ON FUNCTION public.advance_annual_review_status(uuid, public.annual_reviewer_role) TO authenticated;

-- Replace send_back RPC similarly.
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
    IF (p_reviewer_role = 'manager'      AND (v_inst.manager_id  <> v_caller OR v_inst.overall_status <> 'pending_manager')) OR
       (p_reviewer_role = 'skip_manager' AND (v_inst.skip_id     <> v_caller OR v_inst.overall_status <> 'pending_skip'))    OR
       (p_reviewer_role = 'bu_head'      AND (v_inst.bu_head_id  <> v_caller OR v_inst.overall_status <> 'pending_bu'))      OR
       (p_reviewer_role = 'hr'           AND (v_inst.hr_id       <> v_caller OR v_inst.overall_status <> 'pending_hr'))
    THEN RAISE EXCEPTION 'caller is not the active reviewer for stage %', p_reviewer_role;
    END IF;
  END IF;

  v_prev      := public.annual_review_prev_status(v_inst.enabled_stages, p_reviewer_role);
  v_prev_role := public.annual_review_prev_role(v_inst.enabled_stages, p_reviewer_role);

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

-- New RPC: set or update the enabled-stages override for one instance.
CREATE OR REPLACE FUNCTION public.set_annual_review_enabled_stages(
  p_instance_id uuid,
  p_enabled_stages jsonb,
  p_reason text
)
RETURNS void
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_is_admin boolean := public.has_role(v_caller,'admin') OR public.has_role(v_caller,'hr_pms');
  v_status public.annual_review_status;
  v_prev jsonb;
BEGIN
  IF NOT v_is_admin THEN
    RAISE EXCEPTION 'only admin or hr_pms may change the workflow';
  END IF;
  IF p_reason IS NULL OR char_length(btrim(p_reason)) < 3 THEN
    RAISE EXCEPTION 'reason required (min 3 chars)';
  END IF;
  IF jsonb_typeof(p_enabled_stages) <> 'array' OR NOT (p_enabled_stages ? 'self') THEN
    RAISE EXCEPTION 'enabled_stages must be a JSON array containing "self"';
  END IF;

  SELECT overall_status, enabled_stages INTO v_status, v_prev
    FROM public.annual_review_instances WHERE id = p_instance_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'instance % not found', p_instance_id; END IF;
  IF v_status NOT IN ('not_started','pending_self') THEN
    RAISE EXCEPTION 'workflow can only be changed before review starts (current: %)', v_status;
  END IF;

  UPDATE public.annual_review_instances
     SET enabled_stages = p_enabled_stages, updated_at = now()
   WHERE id = p_instance_id;

  INSERT INTO public.system_audit_logs(action, performed_by, metadata)
  VALUES ('annual_review.enabled_stages_set', v_caller, jsonb_build_object(
    'instance_id', p_instance_id,
    'previous', v_prev,
    'new', p_enabled_stages,
    'reason', p_reason
  ));
END $$;

GRANT EXECUTE ON FUNCTION public.set_annual_review_enabled_stages(uuid, jsonb, text) TO authenticated;

COMMENT ON COLUMN public.annual_review_instances.enabled_stages IS
  'JSON array of enabled reviewer roles (subset of self/manager/skip_manager/bu_head/hr). Must contain "self". Advance/send-back RPCs skip disabled stages.';