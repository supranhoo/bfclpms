
CREATE OR REPLACE FUNCTION public.annual_review_compute_final_summary(
  p_instance_id uuid
)
RETURNS TABLE(
  criteria_weighted_score numeric,
  total_score            numeric,
  final_rating           text
)
LANGUAGE plpgsql
STABLE
SET search_path TO 'public'
AS $function$
DECLARE
  v_inst              public.annual_review_instances%ROWTYPE;
  v_effective         jsonb;
  v_sections          jsonb;
  v_criteria          jsonb;
  v_system_cfg        jsonb;
  v_role              text;
  v_high_to_low       text[] := ARRAY['hr','bu_head','dept_head','skip_manager','manager','self'];
  v_scores            jsonb;
  v_crit              jsonb;
  v_id                text;
  v_weight            numeric;
  v_score             numeric;
  v_wsum              numeric := 0;
  v_criteria_raw_max  numeric := 0;
  v_system_max_raw    numeric := 0;
  v_criteria_pool_max numeric := 0;
  v_sys_total         numeric := 0;
  v_sys_val           numeric;
  v_key               text;
  v_criteria_pool_pts numeric := 0;
  v_total             numeric;
BEGIN
  SELECT * INTO v_inst FROM public.annual_review_instances WHERE id = p_instance_id;
  IF NOT FOUND THEN RETURN; END IF;

  SELECT t.sections INTO v_sections
    FROM public.annual_review_templates t
   WHERE t.id = COALESCE(v_inst.template_override_id, v_inst.template_id);

  v_criteria   := v_sections->'criteria';
  v_system_cfg := v_sections->'system_scores';

  IF v_criteria IS NOT NULL AND jsonb_typeof(v_criteria) = 'array' THEN
    FOR v_crit IN SELECT * FROM jsonb_array_elements(v_criteria) LOOP
      v_weight := COALESCE((v_crit->>'weight')::numeric, 0);
      IF v_weight > 0 THEN
        v_criteria_raw_max := v_criteria_raw_max + (v_weight * 5);
      END IF;
    END LOOP;
  END IF;

  IF v_system_cfg IS NOT NULL AND jsonb_typeof(v_system_cfg) = 'array' THEN
    FOR v_crit IN SELECT * FROM jsonb_array_elements(v_system_cfg) LOOP
      v_weight := COALESCE((v_crit->>'weight')::numeric, 0);
      IF v_weight > 0 THEN
        v_system_max_raw := v_system_max_raw + v_weight;
      END IF;
    END LOOP;
  END IF;
  v_criteria_pool_max := GREATEST(0, LEAST(100, 100 - v_system_max_raw));

  v_effective := public.annual_review_effective_chain(p_instance_id);

  IF v_criteria IS NOT NULL AND jsonb_typeof(v_criteria) = 'array' THEN
    FOREACH v_role IN ARRAY v_high_to_low LOOP
      IF v_effective IS NULL OR NOT (v_effective ? v_role) THEN CONTINUE; END IF;

      SELECT r.criteria_scores INTO v_scores
        FROM public.annual_review_responses r
       WHERE r.instance_id = p_instance_id
         AND r.reviewer_role::text = v_role
         AND r.is_locked = true
       LIMIT 1;

      IF v_scores IS NULL THEN CONTINUE; END IF;

      v_wsum := 0;
      FOR v_crit IN SELECT * FROM jsonb_array_elements(v_criteria) LOOP
        v_id     := v_crit->>'id';
        v_weight := COALESCE((v_crit->>'weight')::numeric, 0);
        IF v_id IS NULL OR NOT (v_scores ? v_id) THEN CONTINUE; END IF;
        BEGIN v_score := (v_scores->>v_id)::numeric;
        EXCEPTION WHEN others THEN CONTINUE;
        END;
        IF v_score IS NULL THEN CONTINUE; END IF;
        v_wsum := v_wsum + (v_weight * v_score);
      END LOOP;

      criteria_weighted_score := v_wsum;
      EXIT;
    END LOOP;
  END IF;

  IF v_inst.system_scores IS NOT NULL AND jsonb_typeof(v_inst.system_scores) = 'object' THEN
    FOR v_key IN SELECT jsonb_object_keys(v_inst.system_scores) LOOP
      BEGIN v_sys_val := (v_inst.system_scores->>v_key)::numeric;
      EXCEPTION WHEN others THEN v_sys_val := NULL;
      END;
      IF v_sys_val IS NOT NULL THEN v_sys_total := v_sys_total + v_sys_val; END IF;
    END LOOP;
  END IF;

  IF criteria_weighted_score IS NOT NULL AND v_criteria_raw_max > 0 THEN
    v_criteria_pool_pts := (criteria_weighted_score / v_criteria_raw_max) * v_criteria_pool_max;
  ELSIF criteria_weighted_score IS NOT NULL AND v_criteria_raw_max = 0 THEN
    v_criteria_pool_pts := criteria_weighted_score;
  ELSE
    v_criteria_pool_pts := 0;
  END IF;

  IF criteria_weighted_score IS NULL AND v_sys_total = 0 THEN
    total_score  := NULL;
    final_rating := NULL;
  ELSE
    v_total := GREATEST(0, LEAST(100, v_sys_total + v_criteria_pool_pts));
    total_score  := ROUND(v_total::numeric, 4);
    final_rating := public.annual_review_resolve_final_rating(v_total);
  END IF;

  RETURN NEXT;
END $function$;

COMMENT ON FUNCTION public.annual_review_compute_final_summary(uuid) IS
  'ADR-126 SSOT: normalises raw reviewer weighted_score into the criteria pool '
  'before blending with system score. Mirrors computeScoreComposition (TS SSOT).';

-- Backfill previously-completed instances with the corrected formula.
DO $$
DECLARE
  r          record;
  s          record;
  v_touched  integer := 0;
BEGIN
  FOR r IN
    SELECT i.id,
           i.criteria_weighted_score AS old_cws,
           i.total_score            AS old_total,
           i.final_rating           AS old_rating
      FROM public.annual_review_instances i
     WHERE i.overall_status = 'completed'
        OR i.total_score IS NOT NULL
  LOOP
    SELECT * INTO s FROM public.annual_review_compute_final_summary(r.id);

    IF ROW(r.old_cws, r.old_total, r.old_rating)
       IS DISTINCT FROM ROW(s.criteria_weighted_score, s.total_score, s.final_rating) THEN

      INSERT INTO public.system_audit_logs(action, performed_by, metadata)
      VALUES (
        'ADR_126_PROJECTED_SCORE_NORMALIZATION_V1',
        NULL,
        jsonb_build_object(
          'instance_id', r.id,
          'old_criteria_weighted_score', r.old_cws,
          'old_total_score', r.old_total,
          'old_final_rating', r.old_rating,
          'new_criteria_weighted_score', s.criteria_weighted_score,
          'new_total_score', s.total_score,
          'new_final_rating', s.final_rating
        )
      );

      UPDATE public.annual_review_instances
         SET criteria_weighted_score = s.criteria_weighted_score,
             total_score             = s.total_score,
             final_rating            = s.final_rating,
             updated_at              = now()
       WHERE id = r.id;

      v_touched := v_touched + 1;
    END IF;
  END LOOP;

  RAISE NOTICE 'ADR-126 backfill: % instances updated.', v_touched;
END $$;

-- Security: drop the duplicate unrestricted self-update policy on profiles.
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
