-- =============================================================================
-- Configurable Final Score Rules — Phase 1 foundation
-- =============================================================================

-- 1. Rule definition table -----------------------------------------------------
CREATE TABLE public.workflow_final_score_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope_type text NOT NULL CHECK (scope_type IN ('template','employee','department','pms_grade')),
  scope_value text,
  workflow_template_id uuid NOT NULL REFERENCES public.workflow_templates(id) ON DELETE CASCADE,
  review_period text,
  review_year int,
  rule_type text NOT NULL CHECK (rule_type IN (
    'terminal_stage','self_final','manager_final','functional_manager_final',
    'skip_level_final','hr_pms_final','auditor_final','management_final',
    'hr_calibration_final','mgmt_calibration_final',
    'avg_manager_skip','avg_self_manager_skip','avg_all_completed','weighted_custom'
  )),
  stage_weights jsonb,
  missing_score_policy text NOT NULL DEFAULT 'block'
    CHECK (missing_score_policy IN ('block','ignore','zero')),
  is_active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_by uuid
);

CREATE UNIQUE INDEX uq_wfsr_scope
  ON public.workflow_final_score_rules
    (workflow_template_id, scope_type, COALESCE(scope_value,''), COALESCE(review_period,''), COALESCE(review_year, 0))
  WHERE is_active = true;

CREATE INDEX idx_wfsr_lookup
  ON public.workflow_final_score_rules (workflow_template_id, scope_type, scope_value)
  WHERE is_active = true;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.workflow_final_score_rules TO authenticated;
GRANT ALL ON public.workflow_final_score_rules TO service_role;

ALTER TABLE public.workflow_final_score_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "wfsr_select_privileged"
  ON public.workflow_final_score_rules FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'hr_pms')
    OR public.has_role(auth.uid(), 'management')
    OR public.has_role(auth.uid(), 'auditor')
    OR public.has_role(auth.uid(), 'manager')
  );

CREATE POLICY "wfsr_write_admin_hr_mgmt"
  ON public.workflow_final_score_rules FOR ALL
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'hr_pms')
    OR public.has_role(auth.uid(), 'management')
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'hr_pms')
    OR public.has_role(auth.uid(), 'management')
  );

CREATE TRIGGER trg_wfsr_updated_at
  BEFORE UPDATE ON public.workflow_final_score_rules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. Audit columns on review_submissions --------------------------------------
-- NOTE: No backfill UPDATE — period-lock trigger forbids it. A NULL
-- final_score_rule_type is treated as the legacy 'terminal_stage' behavior
-- by both the TS and SQL resolvers, so historical rows stay correct.
ALTER TABLE public.review_submissions
  ADD COLUMN IF NOT EXISTS final_score_rule_type text,
  ADD COLUMN IF NOT EXISTS final_score_rule_snapshot jsonb,
  ADD COLUMN IF NOT EXISTS final_score_explanation text,
  ADD COLUMN IF NOT EXISTS final_score_calculated_at timestamptz;

-- 3. Rule resolution function (precedence: emp+period → dept+period → grade+period → template default)
CREATE OR REPLACE FUNCTION public.resolve_final_score_rule(
  p_employee_id uuid,
  p_template_id uuid,
  p_review_period text,
  p_review_year int
) RETURNS public.workflow_final_score_rules
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rule public.workflow_final_score_rules;
  v_dept text;
  v_grade text;
BEGIN
  IF p_template_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT department, pms_grade INTO v_dept, v_grade
    FROM public.profiles WHERE id = p_employee_id;

  SELECT * INTO v_rule FROM public.workflow_final_score_rules
   WHERE is_active
     AND workflow_template_id = p_template_id
     AND scope_type = 'employee'
     AND scope_value = p_employee_id::text
     AND review_period = p_review_period
     AND review_year = p_review_year
   LIMIT 1;
  IF FOUND THEN RETURN v_rule; END IF;

  IF v_dept IS NOT NULL THEN
    SELECT * INTO v_rule FROM public.workflow_final_score_rules
     WHERE is_active
       AND workflow_template_id = p_template_id
       AND scope_type = 'department'
       AND scope_value = v_dept
       AND review_period = p_review_period
       AND review_year = p_review_year
     LIMIT 1;
    IF FOUND THEN RETURN v_rule; END IF;
  END IF;

  IF v_grade IS NOT NULL THEN
    SELECT * INTO v_rule FROM public.workflow_final_score_rules
     WHERE is_active
       AND workflow_template_id = p_template_id
       AND scope_type = 'pms_grade'
       AND scope_value = v_grade
       AND review_period = p_review_period
       AND review_year = p_review_year
     LIMIT 1;
    IF FOUND THEN RETURN v_rule; END IF;
  END IF;

  SELECT * INTO v_rule FROM public.workflow_final_score_rules
   WHERE is_active
     AND workflow_template_id = p_template_id
     AND scope_type = 'template'
     AND (review_period IS NULL OR review_period = p_review_period)
     AND (review_year IS NULL OR review_year = p_review_year)
   ORDER BY (review_period IS NOT NULL) DESC, (review_year IS NOT NULL) DESC
   LIMIT 1;
  IF FOUND THEN RETURN v_rule; END IF;

  RETURN NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION public.resolve_final_score_rule(uuid,uuid,text,int) TO authenticated, service_role;

-- 4. Pure computation function (no I/O on submissions) ------------------------
CREATE OR REPLACE FUNCTION public.fn_resolve_final_score(
  p_stage_scores jsonb,
  p_workflow_stages text[],
  p_rule jsonb,
  p_is_na boolean DEFAULT false
) RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_rule_type text;
  v_score numeric;
  v_rating text;
  v_weights jsonb;
  v_policy text;
  v_warnings jsonb := '[]'::jsonb;
  v_explanation text;
  v_used jsonb := '{}'::jsonb;
  v_sum_w numeric := 0;
  v_sum_sw numeric := 0;
  v_stage text;
  v_stage_score numeric;
  v_w numeric;
  v_count int := 0;
  v_present_stages text[];
BEGIN
  IF p_is_na THEN
    RETURN jsonb_build_object(
      'final_score', null, 'final_rating', null,
      'rule_type_used', 'na', 'explanation', 'KPI marked N/A — no final score',
      'missing_warnings', '[]'::jsonb
    );
  END IF;

  v_rule_type := COALESCE(p_rule->>'type', 'terminal_stage');
  v_weights   := COALESCE(p_rule->'stage_weights', '{}'::jsonb);
  v_policy    := COALESCE(p_rule->>'missing_score_policy', 'block');

  IF v_rule_type = 'terminal_stage' THEN
    v_score := COALESCE(
      (p_stage_scores->>'management')::numeric,
      (p_stage_scores->>'mgmt_calibration')::numeric,
      (p_stage_scores->>'auditor')::numeric,
      (p_stage_scores->>'hr_calibration')::numeric,
      (p_stage_scores->>'hr_pms')::numeric,
      (p_stage_scores->>'skip_level')::numeric,
      (p_stage_scores->>'functional_manager')::numeric,
      (p_stage_scores->>'manager')::numeric,
      (p_stage_scores->>'self')::numeric
    );
    v_explanation := 'Last completed stage score';
  ELSIF v_rule_type IN ('self_final','manager_final','functional_manager_final',
                        'skip_level_final','hr_pms_final','auditor_final',
                        'management_final','hr_calibration_final','mgmt_calibration_final') THEN
    v_stage := CASE v_rule_type
      WHEN 'self_final' THEN 'self'
      WHEN 'manager_final' THEN 'manager'
      WHEN 'functional_manager_final' THEN 'functional_manager'
      WHEN 'skip_level_final' THEN 'skip_level'
      WHEN 'hr_pms_final' THEN 'hr_pms'
      WHEN 'auditor_final' THEN 'auditor'
      WHEN 'management_final' THEN 'management'
      WHEN 'hr_calibration_final' THEN 'hr_calibration'
      WHEN 'mgmt_calibration_final' THEN 'mgmt_calibration'
    END;
    v_score := NULLIF(p_stage_scores->>v_stage, '')::numeric;
    v_explanation := format('%s score = final', v_stage);
    IF v_score IS NULL THEN
      v_warnings := v_warnings || jsonb_build_object('stage', v_stage, 'reason', 'missing');
      IF v_policy = 'block' THEN
        RETURN jsonb_build_object(
          'final_score', null, 'final_rating', null,
          'rule_type_used', v_rule_type,
          'explanation', v_explanation,
          'missing_warnings', v_warnings,
          'blocked', jsonb_build_object('reason', format('Required stage %s has no score', v_stage))
        );
      ELSIF v_policy = 'zero' THEN
        v_score := 0;
      END IF;
    END IF;
  ELSIF v_rule_type IN ('avg_manager_skip','avg_self_manager_skip','avg_all_completed') THEN
    IF v_rule_type = 'avg_manager_skip' THEN
      v_present_stages := ARRAY['manager','skip_level'];
    ELSIF v_rule_type = 'avg_self_manager_skip' THEN
      v_present_stages := ARRAY['self','manager','skip_level'];
    ELSE
      v_present_stages := ARRAY['self','manager','functional_manager','skip_level','hr_pms','auditor','management','hr_calibration','mgmt_calibration'];
    END IF;

    FOREACH v_stage IN ARRAY v_present_stages LOOP
      IF v_rule_type <> 'avg_all_completed' AND NOT (v_stage = ANY(p_workflow_stages)) THEN
        v_warnings := v_warnings || jsonb_build_object('stage', v_stage, 'reason', 'not_in_workflow');
        CONTINUE;
      END IF;
      v_stage_score := NULLIF(p_stage_scores->>v_stage, '')::numeric;
      IF v_stage_score IS NULL THEN
        IF v_rule_type = 'avg_all_completed' THEN
          CONTINUE;
        END IF;
        v_warnings := v_warnings || jsonb_build_object('stage', v_stage, 'reason', 'missing');
        IF v_policy = 'block' THEN
          RETURN jsonb_build_object(
            'final_score', null, 'final_rating', null,
            'rule_type_used', v_rule_type,
            'missing_warnings', v_warnings,
            'blocked', jsonb_build_object('reason', format('Stage %s has no score', v_stage))
          );
        ELSIF v_policy = 'zero' THEN
          v_stage_score := 0;
        ELSE
          CONTINUE;
        END IF;
      END IF;
      v_sum_sw := v_sum_sw + v_stage_score;
      v_count := v_count + 1;
      v_used := v_used || jsonb_build_object(v_stage, v_stage_score);
    END LOOP;
    IF v_count > 0 THEN
      v_score := v_sum_sw / v_count;
      v_explanation := format('Average of %s stages = %s', v_count, ROUND(v_score, 2));
    END IF;
  ELSIF v_rule_type = 'weighted_custom' THEN
    FOR v_stage IN SELECT jsonb_object_keys(v_weights) LOOP
      v_w := NULLIF(v_weights->>v_stage, '')::numeric;
      IF v_w IS NULL OR v_w <= 0 THEN CONTINUE; END IF;
      IF NOT (v_stage = ANY(p_workflow_stages)) THEN
        v_warnings := v_warnings || jsonb_build_object('stage', v_stage, 'reason', 'not_in_workflow');
        CONTINUE;
      END IF;
      v_stage_score := NULLIF(p_stage_scores->>v_stage, '')::numeric;
      IF v_stage_score IS NULL THEN
        v_warnings := v_warnings || jsonb_build_object('stage', v_stage, 'reason', 'missing');
        IF v_policy = 'block' THEN
          RETURN jsonb_build_object(
            'final_score', null, 'final_rating', null,
            'rule_type_used', v_rule_type,
            'stage_weights_used', v_weights,
            'missing_warnings', v_warnings,
            'blocked', jsonb_build_object('reason', format('Stage %s has weight but no score', v_stage))
          );
        ELSIF v_policy = 'zero' THEN
          v_stage_score := 0;
        ELSE
          CONTINUE;
        END IF;
      END IF;
      v_sum_w  := v_sum_w + v_w;
      v_sum_sw := v_sum_sw + (v_stage_score * v_w);
      v_used := v_used || jsonb_build_object(v_stage, jsonb_build_object('score', v_stage_score, 'weight', v_w));
    END LOOP;
    IF v_sum_w > 0 THEN
      v_score := v_sum_sw / v_sum_w;
      v_explanation := format('Weighted average (total weight=%s) = %s', v_sum_w, ROUND(v_score, 2));
    END IF;
  END IF;

  IF v_score IS NULL THEN
    RETURN jsonb_build_object(
      'final_score', null, 'final_rating', null,
      'rule_type_used', v_rule_type,
      'explanation', COALESCE(v_explanation, 'No score derivable'),
      'missing_warnings', v_warnings
    );
  END IF;

  v_score := GREATEST(0, LEAST(5, v_score));
  v_rating := CASE
    WHEN ROUND(v_score) >= 5 THEN 'blue'
    WHEN ROUND(v_score) >= 4 THEN 'green'
    WHEN ROUND(v_score) >= 3 THEN 'yellow'
    ELSE 'red'
  END;

  RETURN jsonb_build_object(
    'final_score', ROUND(v_score, 2),
    'final_rating', v_rating,
    'rule_type_used', v_rule_type,
    'stage_weights_used', v_used,
    'explanation', v_explanation,
    'missing_warnings', v_warnings
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_resolve_final_score(jsonb, text[], jsonb, boolean) TO authenticated, service_role;

COMMENT ON TABLE public.workflow_final_score_rules IS
  'Admin-configured rules deciding how review_submissions.final_score is computed. Precedence: employee+period > department+period > pms_grade+period > template default. NULL ⇒ legacy terminal-stage behavior.';
COMMENT ON FUNCTION public.fn_resolve_final_score(jsonb, text[], jsonb, boolean) IS
  'Pure computation of final_score from stage scores + rule. Mirror of src/lib/finalScoreResolver.ts.';
