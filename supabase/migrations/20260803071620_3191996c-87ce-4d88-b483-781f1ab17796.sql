-- ADR-233: KRA sync drift visibility + in-flight coverage.

DROP FUNCTION IF EXISTS public.annual_review_rehydrate_kra_for_cycle(uuid, text, text, uuid[]);

CREATE OR REPLACE FUNCTION public.annual_review_rehydrate_kra_for_cycle(
  p_cycle_id uuid,
  p_mode text,
  p_reason text,
  p_instance_ids uuid[] DEFAULT NULL::uuid[],
  p_include_in_flight boolean DEFAULT false
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_run_id       uuid;
  v_uid          uuid := auth.uid();
  v_fy_start     int;
  v_review_year  int;
  v_inst         record;
  v_tpl_sections jsonb;
  v_slot         jsonb;
  v_new_scores   jsonb;
  v_new_total    numeric;
  v_new_rating   text;
  v_slot_value   numeric;
  v_slot_id      text;
  v_delta        numeric;
  v_changed      boolean;
  v_instance_ct  int := 0;
  v_changed_ct   int := 0;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  IF NOT (public.has_role(v_uid,'admin') OR public.has_role(v_uid,'hr_pms')) THEN
    RAISE EXCEPTION 'admin or hr_pms role required';
  END IF;
  IF p_mode NOT IN ('dry_run','apply') THEN
    RAISE EXCEPTION 'invalid mode %, expected dry_run or apply', p_mode;
  END IF;
  IF p_reason IS NULL OR char_length(trim(p_reason)) < 10 THEN
    RAISE EXCEPTION 'reason must be at least 10 characters';
  END IF;

  SELECT review_year INTO v_review_year
    FROM public.annual_review_cycles WHERE id = p_cycle_id;
  IF v_review_year IS NULL THEN
    RAISE EXCEPTION 'cycle % not found', p_cycle_id;
  END IF;
  v_fy_start := v_review_year - 1;  -- July fy start

  INSERT INTO public.annual_review_kra_rehydrate_runs
    (cycle_id, initiated_by, mode, reason, instance_ids, status)
  VALUES (p_cycle_id, v_uid, p_mode, p_reason, p_instance_ids, 'running')
  RETURNING id INTO v_run_id;

  FOR v_inst IN
    SELECT i.id, i.employee_id, i.template_id, i.template_override_id,
           i.system_scores, i.system_scores_raw, i.total_score, i.final_rating,
           i.overall_status,
           COALESCE(t_over.sections, t.sections) AS sections,
           COALESCE(i.template_override_id, i.template_id) AS effective_template_id
      FROM public.annual_review_instances i
      JOIN public.annual_review_templates t ON t.id = i.template_id
      LEFT JOIN public.annual_review_templates t_over ON t_over.id = i.template_override_id
     WHERE i.cycle_id = p_cycle_id
       AND (
         i.overall_status = 'completed'
         OR (p_include_in_flight AND i.overall_status NOT IN ('excluded'))
       )
       AND (p_instance_ids IS NULL OR i.id = ANY(p_instance_ids))
       AND COALESCE(t_over.sections, t.sections)->'system_scores' @> '[{"source":"carry_kra"}]'::jsonb
  LOOP
    v_instance_ct := v_instance_ct + 1;
    v_tpl_sections := v_inst.sections;
    v_new_scores := COALESCE(v_inst.system_scores, '{}'::jsonb);

    FOR v_slot IN
      SELECT * FROM jsonb_array_elements(v_tpl_sections->'system_scores')
    LOOP
      IF (v_slot->>'source') = 'carry_kra' THEN
        v_slot_id := v_slot->>'id';
        v_slot_value := public.compute_carry_kra_contribution(
          v_inst.employee_id,
          v_fy_start,
          COALESCE(v_slot->'carry_config', '{"aggregation":"overall_avg","excludeNa":true}'::jsonb),
          COALESCE((v_slot->>'weight')::numeric, 0)
        );
        v_new_scores := jsonb_set(v_new_scores, ARRAY[v_slot_id], to_jsonb(v_slot_value), true);
      END IF;
    END LOOP;

    SELECT COALESCE(SUM((value)::numeric), 0)
      INTO v_new_total
      FROM jsonb_each_text(v_new_scores)
     WHERE value ~ '^-?[0-9]+(\.[0-9]+)?$';
    v_new_total := LEAST(100, GREATEST(0, ROUND(v_new_total, 2)));
    v_new_rating := public.annual_review_resolve_final_rating(v_new_total);

    v_delta := v_new_total - COALESCE(v_inst.total_score, 0);
    v_changed := (
      COALESCE(v_inst.total_score, -1) <> v_new_total
      OR COALESCE(v_inst.final_rating, '') <> COALESCE(v_new_rating, '')
      OR COALESCE(v_inst.system_scores, '{}'::jsonb) <> v_new_scores
    );

    INSERT INTO public.annual_review_kra_rehydrate_items
      (run_id, instance_id, employee_id, template_id,
       old_system_scores, old_system_scores_raw, old_total_score, old_final_rating,
       new_system_scores, new_total_score, new_final_rating,
       delta_total, band_changed, applied, note)
    VALUES
      (v_run_id, v_inst.id, v_inst.employee_id, v_inst.effective_template_id,
       COALESCE(v_inst.system_scores, '{}'::jsonb),
       COALESCE(v_inst.system_scores_raw, '{}'::jsonb),
       v_inst.total_score, v_inst.final_rating,
       v_new_scores, v_new_total, v_new_rating,
       v_delta,
       COALESCE(v_inst.final_rating,'') <> COALESCE(v_new_rating,''),
       (p_mode = 'apply' AND v_changed),
       CASE WHEN v_inst.overall_status <> 'completed'
            THEN 'in-flight (' || v_inst.overall_status || ')' END);

    IF v_changed THEN
      v_changed_ct := v_changed_ct + 1;
      IF p_mode = 'apply' THEN
        IF v_inst.overall_status = 'completed' THEN
          UPDATE public.annual_review_instances
             SET system_scores = v_new_scores,
                 total_score   = v_new_total,
                 final_rating  = v_new_rating,
                 updated_at    = now()
           WHERE id = v_inst.id;
        ELSE
          -- In-flight: refresh the KRA inputs only. Total/rating stay derived
          -- by the normal workflow until the review completes.
          UPDATE public.annual_review_instances
             SET system_scores = v_new_scores,
                 updated_at    = now()
           WHERE id = v_inst.id;
        END IF;
      END IF;
    END IF;
  END LOOP;

  UPDATE public.annual_review_kra_rehydrate_runs
     SET instance_count = v_instance_ct,
         changed_count  = v_changed_ct,
         status         = 'completed',
         completed_at   = now()
   WHERE id = v_run_id;

  BEGIN
    INSERT INTO public.annual_review_access_audit
      (actor_id, action, target_kind, target_id, details, created_at)
    VALUES
      (v_uid,
       CASE WHEN p_mode='apply' THEN 'annual_review.kra_rehydrate_applied'
            ELSE 'annual_review.kra_rehydrate_dry_run' END,
       'cycle', p_cycle_id,
       jsonb_build_object(
         'run_id', v_run_id,
         'mode', p_mode,
         'instance_count', v_instance_ct,
         'changed_count', v_changed_ct,
         'include_in_flight', p_include_in_flight,
         'reason', p_reason
       ),
       now());
  EXCEPTION WHEN OTHERS THEN NULL; END;

  RETURN v_run_id;

EXCEPTION WHEN OTHERS THEN
  UPDATE public.annual_review_kra_rehydrate_runs
     SET status='failed', error_message=SQLERRM, completed_at=now()
   WHERE id = v_run_id;
  RAISE;
END $function$;

-- Drift summary for a cycle: how many KRA reviews no longer match the latest
-- monthly KPI data, and when the last apply run happened.
CREATE OR REPLACE FUNCTION public.annual_review_kra_drift_summary(p_cycle_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_fy_start int;
  v_review_year int;
  v_total int := 0;
  v_drifted int := 0;
  v_in_flight int := 0;
  v_last_applied timestamptz;
  v_last_run_id uuid;
  v_inst record;
  v_slot jsonb;
  v_stored numeric;
  v_new numeric;
  v_drift boolean;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF NOT (public.has_role(v_uid,'admin') OR public.has_role(v_uid,'hr_pms')) THEN
    RAISE EXCEPTION 'admin or hr_pms role required';
  END IF;

  SELECT review_year INTO v_review_year FROM public.annual_review_cycles WHERE id = p_cycle_id;
  IF v_review_year IS NULL THEN RAISE EXCEPTION 'cycle % not found', p_cycle_id; END IF;
  v_fy_start := v_review_year - 1;

  SELECT r.completed_at, r.id INTO v_last_applied, v_last_run_id
    FROM public.annual_review_kra_rehydrate_runs r
   WHERE r.cycle_id = p_cycle_id AND r.mode = 'apply' AND r.status = 'completed'
   ORDER BY r.completed_at DESC NULLS LAST
   LIMIT 1;

  FOR v_inst IN
    SELECT i.id, i.employee_id, i.overall_status,
           COALESCE(i.system_scores,'{}'::jsonb) AS system_scores,
           COALESCE(t_over.sections, t.sections) AS sections
      FROM public.annual_review_instances i
      JOIN public.annual_review_templates t ON t.id = i.template_id
      LEFT JOIN public.annual_review_templates t_over ON t_over.id = i.template_override_id
     WHERE i.cycle_id = p_cycle_id
       AND i.overall_status <> 'excluded'
       AND COALESCE(t_over.sections, t.sections)->'system_scores' @> '[{"source":"carry_kra"}]'::jsonb
  LOOP
    v_total := v_total + 1;
    IF v_inst.overall_status <> 'completed' THEN v_in_flight := v_in_flight + 1; END IF;
    v_drift := false;
    FOR v_slot IN SELECT * FROM jsonb_array_elements(v_inst.sections->'system_scores') LOOP
      IF (v_slot->>'source') = 'carry_kra' THEN
        v_new := public.compute_carry_kra_contribution(
          v_inst.employee_id, v_fy_start,
          COALESCE(v_slot->'carry_config','{"aggregation":"overall_avg","excludeNa":true}'::jsonb),
          COALESCE((v_slot->>'weight')::numeric, 0));
        v_stored := NULLIF(v_inst.system_scores->>(v_slot->>'id'), '')::numeric;
        IF v_stored IS DISTINCT FROM ROUND(v_new, 2) AND ROUND(COALESCE(v_stored, -1), 2) <> ROUND(v_new, 2) THEN
          v_drift := true;
        END IF;
      END IF;
    END LOOP;
    IF v_drift THEN v_drifted := v_drifted + 1; END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'cycle_id', p_cycle_id,
    'kra_instances', v_total,
    'in_flight', v_in_flight,
    'drifted', v_drifted,
    'last_applied_at', v_last_applied,
    'last_applied_run_id', v_last_run_id,
    'computed_at', now()
  );
END $function$;

-- Per-instance drift check used by the review form's System Scores card.
CREATE OR REPLACE FUNCTION public.annual_review_kra_instance_drift(p_instance_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_inst record;
  v_fy_start int;
  v_slot jsonb;
  v_stored numeric;
  v_new numeric;
  v_slots jsonb := '[]'::jsonb;
  v_drift boolean := false;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;

  SELECT i.id, i.employee_id, i.cycle_id,
         COALESCE(i.system_scores,'{}'::jsonb) AS system_scores,
         COALESCE(t_over.sections, t.sections) AS sections,
         c.review_year
    INTO v_inst
    FROM public.annual_review_instances i
    JOIN public.annual_review_cycles c ON c.id = i.cycle_id
    JOIN public.annual_review_templates t ON t.id = i.template_id
    LEFT JOIN public.annual_review_templates t_over ON t_over.id = i.template_override_id
   WHERE i.id = p_instance_id;

  IF v_inst.id IS NULL THEN
    RETURN jsonb_build_object('found', false, 'drifted', false, 'slots', '[]'::jsonb);
  END IF;

  v_fy_start := v_inst.review_year - 1;

  FOR v_slot IN SELECT * FROM jsonb_array_elements(v_inst.sections->'system_scores') LOOP
    IF (v_slot->>'source') = 'carry_kra' THEN
      v_new := ROUND(public.compute_carry_kra_contribution(
        v_inst.employee_id, v_fy_start,
        COALESCE(v_slot->'carry_config','{"aggregation":"overall_avg","excludeNa":true}'::jsonb),
        COALESCE((v_slot->>'weight')::numeric, 0)), 2);
      v_stored := NULLIF(v_inst.system_scores->>(v_slot->>'id'), '')::numeric;
      IF ROUND(COALESCE(v_stored, -1), 2) <> v_new THEN v_drift := true; END IF;
      v_slots := v_slots || jsonb_build_object(
        'slot_id', v_slot->>'id',
        'label', COALESCE(v_slot->>'label', v_slot->>'name'),
        'stored', v_stored,
        'computed', v_new
      );
    END IF;
  END LOOP;

  RETURN jsonb_build_object('found', true, 'drifted', v_drift, 'slots', v_slots);
END $function$;

REVOKE ALL ON FUNCTION public.annual_review_kra_drift_summary(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.annual_review_kra_instance_drift(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.annual_review_kra_drift_summary(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.annual_review_kra_instance_drift(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.annual_review_rehydrate_kra_for_cycle(uuid, text, text, uuid[], boolean) TO authenticated;