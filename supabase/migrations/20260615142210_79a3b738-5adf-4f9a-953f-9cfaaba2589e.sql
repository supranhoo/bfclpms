-- Allow excluding 'self' from annual_review_instances.enabled_stages.
-- Self is no longer mandatory; the chain must contain at least one stage.

-- 1. Validation trigger: drop self-required check, keep subset + non-empty checks.
CREATE OR REPLACE FUNCTION public.tg_annual_review_validate_enabled_stages()
RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_bad int;
BEGIN
  IF NEW.enabled_stages IS NULL OR jsonb_typeof(NEW.enabled_stages) <> 'array' THEN
    RAISE EXCEPTION 'enabled_stages must be a JSON array';
  END IF;
  IF jsonb_array_length(NEW.enabled_stages) < 1 THEN
    RAISE EXCEPTION 'enabled_stages must contain at least one stage';
  END IF;
  SELECT count(*) INTO v_bad
    FROM jsonb_array_elements_text(NEW.enabled_stages) x
   WHERE x NOT IN ('self','manager','skip_manager','bu_head','hr');
  IF v_bad > 0 THEN
    RAISE EXCEPTION 'enabled_stages contains unknown stage';
  END IF;
  RETURN NEW;
END $$;

-- 2. Helper: first enabled stage as pending_* status (used to retarget overall_status).
CREATE OR REPLACE FUNCTION public.annual_review_first_pending_status(p_enabled jsonb)
RETURNS public.annual_review_status
LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
DECLARE
  v_first text;
BEGIN
  SELECT s INTO v_first
    FROM (VALUES ('self',1),('manager',2),('skip_manager',3),('bu_head',4),('hr',5)) AS t(s,ord)
   WHERE p_enabled ? t.s
   ORDER BY ord
   LIMIT 1;
  IF v_first IS NULL THEN
    RETURN 'not_started';
  END IF;
  RETURN CASE v_first
    WHEN 'self'         THEN 'pending_self'
    WHEN 'manager'      THEN 'pending_manager'
    WHEN 'skip_manager' THEN 'pending_skip'
    WHEN 'bu_head'      THEN 'pending_bu'
    WHEN 'hr'           THEN 'pending_hr'
  END::public.annual_review_status;
END $$;

-- 3. Replace set_annual_review_enabled_stages:
--    * drop "must contain self" check
--    * widen gate: not_started OR (no responses submitted yet)
--    * re-target overall_status to first enabled pending stage when needed
CREATE OR REPLACE FUNCTION public.set_annual_review_enabled_stages(
  p_instance_id uuid,
  p_enabled_stages jsonb,
  p_reason text
)
RETURNS void
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_status public.annual_review_status;
  v_prev   jsonb;
  v_has_responses boolean;
  v_new_status public.annual_review_status;
BEGIN
  IF NOT (public.has_role(v_caller,'admin') OR public.has_role(v_caller,'hr_pms')) THEN
    RAISE EXCEPTION 'only admin / hr_pms may change enabled_stages';
  END IF;
  IF p_reason IS NULL OR length(trim(p_reason)) < 3 THEN
    RAISE EXCEPTION 'reason is required (min 3 chars)';
  END IF;
  IF jsonb_typeof(p_enabled_stages) <> 'array' OR jsonb_array_length(p_enabled_stages) < 1 THEN
    RAISE EXCEPTION 'enabled_stages must be a non-empty JSON array';
  END IF;

  SELECT overall_status, enabled_stages INTO v_status, v_prev
    FROM public.annual_review_instances WHERE id = p_instance_id FOR UPDATE;

  SELECT EXISTS(SELECT 1 FROM public.annual_review_responses WHERE instance_id = p_instance_id)
    INTO v_has_responses;

  -- Allowed when no reviewer has yet acted (no responses) OR pre-start.
  IF v_status NOT IN ('not_started','pending_self') AND v_has_responses THEN
    RAISE EXCEPTION 'cannot change workflow after review has been actioned';
  END IF;

  v_new_status := public.annual_review_first_pending_status(p_enabled_stages);

  UPDATE public.annual_review_instances
     SET enabled_stages = p_enabled_stages,
         overall_status = CASE
           WHEN v_status = 'not_started' THEN v_status
           WHEN v_has_responses THEN v_status
           ELSE v_new_status
         END,
         updated_at = now()
   WHERE id = p_instance_id;

  INSERT INTO public.system_audit_logs(action, performed_by, metadata)
  VALUES ('annual_review.enabled_stages_set', v_caller, jsonb_build_object(
    'instance_id', p_instance_id,
    'previous', v_prev,
    'new', p_enabled_stages,
    'reason', p_reason,
    'retargeted_status', CASE WHEN v_status IN ('not_started') OR v_has_responses THEN NULL ELSE v_new_status END
  ));
END $$;

GRANT EXECUTE ON FUNCTION public.set_annual_review_enabled_stages(uuid, jsonb, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.annual_review_first_pending_status(jsonb) TO authenticated;

COMMENT ON COLUMN public.annual_review_instances.enabled_stages IS
  'JSON array of enabled reviewer roles (subset of self/manager/skip_manager/bu_head/hr). Must contain at least one stage. Self is optional. Advance/send-back RPCs skip disabled stages.';