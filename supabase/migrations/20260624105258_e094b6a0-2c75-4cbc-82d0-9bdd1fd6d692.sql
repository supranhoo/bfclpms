-- Add dept_head bucket to Final Score Weights (validator + compute mirror + comment)

CREATE OR REPLACE FUNCTION public.annual_review_validate_stage_weights(p_weights JSONB)
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_key TEXT;
  v_val NUMERIC;
  v_total NUMERIC := 0;
  v_allowed TEXT[] := ARRAY['self','manager','skip_manager','dept_head','bu_head','hr','system','criteria'];
BEGIN
  IF p_weights IS NULL THEN RETURN TRUE; END IF;
  IF jsonb_typeof(p_weights) <> 'object' THEN RETURN FALSE; END IF;

  FOR v_key, v_val IN
    SELECT key, (value)::text::numeric FROM jsonb_each_text(p_weights)
  LOOP
    IF NOT (v_key = ANY(v_allowed)) THEN RETURN FALSE; END IF;
    IF v_val IS NULL OR v_val < 0 THEN RETURN FALSE; END IF;
    v_total := v_total + v_val;
  END LOOP;

  RETURN abs(v_total - 100) < 0.01;
EXCEPTION WHEN OTHERS THEN
  RETURN FALSE;
END;
$$;

CREATE OR REPLACE FUNCTION public.annual_review_instances_validate_weights_tg()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.stage_weights_override IS NOT NULL
     AND NOT public.annual_review_validate_stage_weights(NEW.stage_weights_override) THEN
    RAISE EXCEPTION 'stage_weights_override invalid: keys must be in (self,manager,skip_manager,dept_head,bu_head,hr,system,criteria) and values must sum to 100'
      USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON COLUMN public.annual_review_instances.stage_weights_override IS
  'Optional per-employee final-score weight blend. When NULL, template.sections.stage_weights wins; when that is also absent, legacy {criteria:100} applies. Keys: self|manager|skip_manager|dept_head|bu_head|hr|system|criteria. Values must sum to 100.';

CREATE OR REPLACE FUNCTION public.annual_review_compute_final_score(
  p_stage_weights JSONB,
  p_responses_by_role JSONB,
  p_system_score_total NUMERIC,
  p_criteria_weighted_score NUMERIC
) RETURNS JSONB
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_keys TEXT[] := ARRAY['self','manager','skip_manager','dept_head','bu_head','hr','system','criteria'];
  v_key TEXT;
  v_weight NUMERIC;
  v_value NUMERIC;
  v_total_weight NUMERIC := 0;
  v_weighted_sum NUMERIC := 0;
  v_contributing TEXT[] := ARRAY[]::TEXT[];
  v_dropped BOOLEAN := FALSE;
  v_raw NUMERIC;
BEGIN
  IF p_stage_weights IS NULL OR jsonb_typeof(p_stage_weights) <> 'object' THEN
    RETURN jsonb_build_object('raw_score_0_100', NULL, 'scaled_0_5', NULL,
                              'contributing', '[]'::jsonb, 'renormalised', false);
  END IF;

  FOREACH v_key IN ARRAY v_keys LOOP
    v_weight := NULLIF(p_stage_weights->>v_key, '')::NUMERIC;
    IF v_weight IS NULL OR v_weight <= 0 THEN CONTINUE; END IF;

    IF v_key = 'system' THEN v_value := p_system_score_total;
    ELSIF v_key = 'criteria' THEN v_value := p_criteria_weighted_score;
    ELSE
      v_value := NULLIF(p_responses_by_role->>v_key, '')::NUMERIC;
    END IF;

    IF v_value IS NULL THEN
      v_dropped := TRUE;
      CONTINUE;
    END IF;

    v_total_weight := v_total_weight + v_weight;
    v_weighted_sum := v_weighted_sum + v_value * v_weight;
    v_contributing := array_append(v_contributing, v_key);
  END LOOP;

  IF v_total_weight <= 0 THEN
    RETURN jsonb_build_object('raw_score_0_100', NULL, 'scaled_0_5', NULL,
                              'contributing', to_jsonb(v_contributing),
                              'renormalised', v_dropped);
  END IF;

  v_raw := v_weighted_sum / v_total_weight;
  RETURN jsonb_build_object(
    'raw_score_0_100', round(v_raw::numeric, 4),
    'scaled_0_5', round((v_raw / 100 * 5)::numeric, 4),
    'contributing', to_jsonb(v_contributing),
    'renormalised', v_dropped
  );
END;
$$;