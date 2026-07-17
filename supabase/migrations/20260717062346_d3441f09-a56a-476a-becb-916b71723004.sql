
-- 1) One-shot backfill: null out reviewer id columns for stages not enabled.
--    Safe: these columns are meaningless when the stage is disabled and no
--    downstream review activity exists for a disabled stage.
UPDATE public.annual_review_instances
   SET manager_id  = CASE WHEN enabled_stages ? 'manager'      THEN manager_id  ELSE NULL END,
       skip_id     = CASE WHEN enabled_stages ? 'skip_manager' THEN skip_id     ELSE NULL END,
       dept_head_id= CASE WHEN enabled_stages ? 'dept_head'    THEN dept_head_id ELSE NULL END,
       bu_head_id  = CASE WHEN enabled_stages ? 'bu_head'      THEN bu_head_id  ELSE NULL END,
       hr_id       = CASE WHEN enabled_stages ? 'hr'           THEN hr_id       ELSE NULL END
 WHERE (NOT (enabled_stages ? 'manager')      AND manager_id   IS NOT NULL)
    OR (NOT (enabled_stages ? 'skip_manager') AND skip_id      IS NOT NULL)
    OR (NOT (enabled_stages ? 'dept_head')    AND dept_head_id IS NOT NULL)
    OR (NOT (enabled_stages ? 'bu_head')      AND bu_head_id   IS NOT NULL)
    OR (NOT (enabled_stages ? 'hr')           AND hr_id        IS NOT NULL);

-- Audit trail for the sweep
INSERT INTO public.system_audit_logs (action, performed_by, metadata)
VALUES (
  'annual_review.reviewer_slot_backfill',
  NULL,
  jsonb_build_object(
    'reason',      'CAPA: reviewer id columns must be NULL when corresponding stage is disabled',
    'source',      'ghost_direct_reports_rca',
    'executed_at', now()
  )
);

-- 2) Enforcement trigger: whenever enabled_stages changes, clear the
--    reviewer id columns for stages that are no longer enabled.
CREATE OR REPLACE FUNCTION public.tg_annual_review_clear_disabled_reviewer_slots()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.enabled_stages IS NULL THEN
    RETURN NEW;
  END IF;
  IF NOT (NEW.enabled_stages ? 'manager')      THEN NEW.manager_id   := NULL; END IF;
  IF NOT (NEW.enabled_stages ? 'skip_manager') THEN NEW.skip_id      := NULL; END IF;
  IF NOT (NEW.enabled_stages ? 'dept_head')    THEN NEW.dept_head_id := NULL; END IF;
  IF NOT (NEW.enabled_stages ? 'bu_head')      THEN NEW.bu_head_id   := NULL; END IF;
  IF NOT (NEW.enabled_stages ? 'hr')           THEN NEW.hr_id        := NULL; END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS annual_review_clear_disabled_reviewer_slots
  ON public.annual_review_instances;
CREATE TRIGGER annual_review_clear_disabled_reviewer_slots
  BEFORE INSERT OR UPDATE OF enabled_stages, manager_id, skip_id, dept_head_id, bu_head_id, hr_id
  ON public.annual_review_instances
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_annual_review_clear_disabled_reviewer_slots();

-- 3) Patch set_annual_review_enabled_stages so the narrowing action itself
--    scrubs the now-disabled reviewer slots and audits what was cleared.
CREATE OR REPLACE FUNCTION public.set_annual_review_enabled_stages(
  p_instance_id uuid,
  p_enabled_stages jsonb,
  p_reason text
)
RETURNS void
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  v_caller uuid := auth.uid();
  v_status public.annual_review_status;
  v_prev   jsonb;
  v_has_responses boolean;
  v_new_status public.annual_review_status;
  v_cleared jsonb := '{}'::jsonb;
  v_prev_mgr uuid; v_prev_skip uuid; v_prev_dept uuid; v_prev_bu uuid; v_prev_hr uuid;
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

  SELECT overall_status, enabled_stages, manager_id, skip_id, dept_head_id, bu_head_id, hr_id
    INTO v_status, v_prev, v_prev_mgr, v_prev_skip, v_prev_dept, v_prev_bu, v_prev_hr
    FROM public.annual_review_instances WHERE id = p_instance_id FOR UPDATE;

  SELECT EXISTS(SELECT 1 FROM public.annual_review_responses WHERE instance_id = p_instance_id)
    INTO v_has_responses;

  IF v_status NOT IN ('not_started','pending_self') AND v_has_responses THEN
    RAISE EXCEPTION 'cannot change workflow after review has been actioned';
  END IF;

  v_new_status := public.annual_review_first_pending_status(p_enabled_stages);

  IF v_prev_mgr  IS NOT NULL AND NOT (p_enabled_stages ? 'manager')      THEN v_cleared := v_cleared || jsonb_build_object('manager_id',  v_prev_mgr); END IF;
  IF v_prev_skip IS NOT NULL AND NOT (p_enabled_stages ? 'skip_manager') THEN v_cleared := v_cleared || jsonb_build_object('skip_id',     v_prev_skip); END IF;
  IF v_prev_dept IS NOT NULL AND NOT (p_enabled_stages ? 'dept_head')    THEN v_cleared := v_cleared || jsonb_build_object('dept_head_id',v_prev_dept); END IF;
  IF v_prev_bu   IS NOT NULL AND NOT (p_enabled_stages ? 'bu_head')      THEN v_cleared := v_cleared || jsonb_build_object('bu_head_id',  v_prev_bu); END IF;
  IF v_prev_hr   IS NOT NULL AND NOT (p_enabled_stages ? 'hr')           THEN v_cleared := v_cleared || jsonb_build_object('hr_id',       v_prev_hr); END IF;

  UPDATE public.annual_review_instances
     SET enabled_stages = p_enabled_stages,
         overall_status = CASE
           WHEN v_status = 'not_started' THEN v_status
           WHEN v_has_responses THEN v_status
           ELSE v_new_status
         END,
         updated_at = now()
   WHERE id = p_instance_id;
  -- Reviewer-slot scrubbing is handled by the BEFORE trigger above.

  INSERT INTO public.system_audit_logs(action, performed_by, metadata)
  VALUES ('annual_review.enabled_stages_set', v_caller, jsonb_build_object(
    'instance_id',        p_instance_id,
    'previous',           v_prev,
    'new',                p_enabled_stages,
    'reason',             p_reason,
    'retargeted_status',  CASE WHEN v_status IN ('not_started') OR v_has_responses THEN NULL ELSE v_new_status END,
    'cleared_reviewers',  v_cleared
  ));
END $function$;
