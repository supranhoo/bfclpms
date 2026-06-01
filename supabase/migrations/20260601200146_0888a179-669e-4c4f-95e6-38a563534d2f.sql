-- Phase 4: server-side parity for Configurable Final Score Rules.
-- Adds public.apply_final_score_rule(kpi_id) which re-resolves final_score/rating
-- via the configured rule (or terminal_stage fallback). A recursion-guarded
-- AFTER UPDATE trigger on review_submissions ensures every server-side write
-- path (bulk_write_stage_scores, bulk_finalize_stage, repair RPCs, direct
-- updates) produces the same final_score as the client resolver.

CREATE OR REPLACE FUNCTION public.apply_final_score_rule(p_kpi_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sub review_submissions;
  v_kpi kpis;
  v_tmpl record;
  v_rule workflow_final_score_rules;
  v_stage_scores jsonb;
  v_workflow_stages text[];
  v_result jsonb;
  v_rule_jsonb jsonb;
  v_stage_map jsonb := jsonb_build_object(
    'self_review','self',
    'manager_check','manager',
    'functional_manager_check','functional_manager',
    'skip_level_check','skip_level',
    'hr_pms_review','hr_pms',
    'audit','auditor',
    'management_review','management',
    'hr_calibration','hr_calibration',
    'management_calibration','mgmt_calibration'
  );
  v_new_score numeric;
  v_new_rating_text text;
BEGIN
  SELECT * INTO v_sub FROM review_submissions WHERE kpi_id = p_kpi_id;
  IF NOT FOUND THEN RETURN; END IF;

  SELECT * INTO v_kpi FROM kpis WHERE id = p_kpi_id;
  IF NOT FOUND THEN RETURN; END IF;

  -- Only resolve when KPI is approved (the only state stamping final_score).
  IF v_kpi.status IS DISTINCT FROM 'approved' THEN
    RETURN;
  END IF;

  -- N/A short-circuit
  IF v_sub.is_na IS TRUE THEN
    IF v_sub.final_score IS NOT NULL OR v_sub.final_rating IS NOT NULL THEN
      PERFORM set_config('app.in_final_score_rule', 'on', true);
      UPDATE review_submissions
         SET final_score = NULL,
             final_rating = NULL,
             final_score_rule_type = 'na',
             final_score_explanation = 'KPI marked N/A',
             final_score_calculated_at = now(),
             updated_at = now()
       WHERE kpi_id = p_kpi_id;
      PERFORM set_config('app.in_final_score_rule', 'off', true);
    END IF;
    RETURN;
  END IF;

  -- Effective workflow template + stages
  SELECT * INTO v_tmpl
    FROM get_employee_workflow_info(v_kpi.employee_id, v_kpi.review_period, v_kpi.review_year)
   LIMIT 1;

  IF v_tmpl.template_id IS NULL THEN
    RETURN;  -- no template → leave legacy values intact
  END IF;

  SELECT COALESCE(array_agg(v_stage_map->>x) FILTER (WHERE v_stage_map ? x), ARRAY[]::text[])
    INTO v_workflow_stages
    FROM jsonb_array_elements_text(COALESCE(v_tmpl.stages, '[]'::jsonb)) AS x;

  v_rule := resolve_final_score_rule(v_kpi.employee_id, v_tmpl.template_id, v_kpi.review_period, v_kpi.review_year);

  v_rule_jsonb := CASE
    WHEN v_rule.id IS NOT NULL THEN
      jsonb_build_object(
        'type', v_rule.rule_type,
        'stage_weights', v_rule.stage_weights,
        'missing_score_policy', v_rule.missing_score_policy
      )
    ELSE NULL
  END;

  v_stage_scores := jsonb_build_object(
    'self', v_sub.self_score,
    'manager', v_sub.manager_score,
    'functional_manager', v_sub.functional_manager_score,
    'skip_level', v_sub.skip_level_score,
    'hr_pms', v_sub.hr_pms_score,
    'auditor', v_sub.auditor_score,
    'management', v_sub.management_score
  );

  v_result := fn_resolve_final_score(v_stage_scores, v_workflow_stages, v_rule_jsonb, false);

  IF v_result IS NULL THEN RETURN; END IF;

  -- If the rule blocked, do NOT touch final_score; leave the row as-is so
  -- admins notice the absence rather than silently dropping a value.
  IF (v_result ? 'blocked') THEN
    RAISE WARNING 'apply_final_score_rule: rule blocked kpi % — %', p_kpi_id, v_result->>'blocked';
    RETURN;
  END IF;

  v_new_score := NULLIF(v_result->>'final_score', '')::numeric;
  v_new_rating_text := NULLIF(v_result->>'final_rating', '');

  -- Skip write when nothing changed
  IF v_sub.final_score IS NOT DISTINCT FROM v_new_score
     AND v_sub.final_rating::text IS NOT DISTINCT FROM v_new_rating_text
     AND v_sub.final_score_rule_type IS NOT DISTINCT FROM (v_result->>'rule_type_used')
  THEN
    RETURN;
  END IF;

  PERFORM set_config('app.in_final_score_rule', 'on', true);
  UPDATE review_submissions
     SET final_score = v_new_score,
         final_rating = CASE WHEN v_new_rating_text IS NULL THEN NULL ELSE v_new_rating_text::rating_level END,
         final_score_rule_type = v_result->>'rule_type_used',
         final_score_rule_snapshot = v_rule_jsonb,
         final_score_explanation = v_result->>'explanation',
         final_score_calculated_at = now(),
         updated_at = now()
   WHERE kpi_id = p_kpi_id;
  PERFORM set_config('app.in_final_score_rule', 'off', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.apply_final_score_rule(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.apply_final_score_rule(uuid) IS
  'POLICY §131 server-side resolver: re-stamps review_submissions.final_score using the configured Workflow Final Score Rule (or legacy terminal_stage when none).';

-- Trigger: fire after any reviewer-stage score or final_score write so all
-- bulk RPCs and direct updates converge on the rule result. Guarded against
-- self-recursion via session-local app.in_final_score_rule flag.
CREATE OR REPLACE FUNCTION public.trg_apply_final_score_rule()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Re-entry guard
  IF COALESCE(current_setting('app.in_final_score_rule', true), 'off') = 'on' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND (
       NEW.final_score IS DISTINCT FROM OLD.final_score
    OR NEW.self_score IS DISTINCT FROM OLD.self_score
    OR NEW.manager_score IS DISTINCT FROM OLD.manager_score
    OR NEW.functional_manager_score IS DISTINCT FROM OLD.functional_manager_score
    OR NEW.skip_level_score IS DISTINCT FROM OLD.skip_level_score
    OR NEW.hr_pms_score IS DISTINCT FROM OLD.hr_pms_score
    OR NEW.auditor_score IS DISTINCT FROM OLD.auditor_score
    OR NEW.management_score IS DISTINCT FROM OLD.management_score
    OR NEW.is_na IS DISTINCT FROM OLD.is_na
  ) THEN
    PERFORM public.apply_final_score_rule(NEW.kpi_id);
  ELSIF TG_OP = 'INSERT' AND NEW.final_score IS NOT NULL THEN
    PERFORM public.apply_final_score_rule(NEW.kpi_id);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_apply_final_score_rule_aiu ON public.review_submissions;
CREATE TRIGGER trg_apply_final_score_rule_aiu
  AFTER INSERT OR UPDATE ON public.review_submissions
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_apply_final_score_rule();

COMMENT ON TRIGGER trg_apply_final_score_rule_aiu ON public.review_submissions IS
  'Ensures every server-side write converges on the configured Final Score Rule.';