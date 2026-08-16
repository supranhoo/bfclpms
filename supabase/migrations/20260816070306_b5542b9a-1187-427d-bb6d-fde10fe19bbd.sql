-- ADR-282 — the scoring model of a KPI is group-owned; per-employee tuning is scope-only.

CREATE OR REPLACE FUNCTION public.bu_console_validate_changes(p_changes jsonb)
 RETURNS void
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
DECLARE
  v_freq text;
  v_anchor text;
  v_opts jsonb;
  v_opt jsonb;
BEGIN
  IF p_changes IS NULL THEN RETURN; END IF;

  v_freq := NULLIF(btrim(COALESCE(p_changes->>'frequency','')), '');

  IF v_freq IS NOT NULL AND v_freq IN ('Bi-Monthly','Quarterly','Half-Yearly','Yearly') THEN
    IF NOT (p_changes ? 'frequency_cycle_start')
       OR NULLIF(btrim(COALESCE(p_changes->>'frequency_cycle_start','')), '') IS NULL THEN
      RAISE EXCEPTION 'A % KPI needs a cycle anchor (e.g. Jan-Feb). Pick the cycle before applying.', v_freq;
    END IF;
  END IF;

  IF v_freq IS NOT NULL AND v_freq NOT IN ('Bi-Monthly','Quarterly','Half-Yearly','Yearly') THEN
    v_anchor := NULLIF(btrim(COALESCE(p_changes->>'frequency_cycle_start','')), '');
    IF v_anchor IS NOT NULL THEN
      RAISE EXCEPTION 'A % KPI cannot carry a multi-month cycle anchor.', v_freq;
    END IF;
  END IF;

  IF (p_changes ? 'day_count_type')
     AND NULLIF(btrim(COALESCE(p_changes->>'day_count_type','')), '') IS NOT NULL
     AND COALESCE(p_changes->>'day_count_type','') NOT IN ('working_days','all_days') THEN
    RAISE EXCEPTION 'Day counting must be working_days or all_days.';
  END IF;

  -- ADR-282 — a qualitative scoring list must be usable by the scorecards.
  IF (p_changes ? 'qualitative_options')
     AND NULLIF(btrim(COALESCE(p_changes->>'qualitative_options','')), '') IS NOT NULL THEN
    BEGIN
      v_opts := (p_changes->>'qualitative_options')::jsonb;
    EXCEPTION WHEN others THEN
      RAISE EXCEPTION 'Scoring options must be a list of options with a label and a rating.';
    END;
    IF jsonb_typeof(v_opts) <> 'array' OR jsonb_array_length(v_opts) = 0 THEN
      RAISE EXCEPTION 'Scoring options must be a non-empty list of options.';
    END IF;
    FOR v_opt IN SELECT * FROM jsonb_array_elements(v_opts)
    LOOP
      IF NULLIF(btrim(COALESCE(v_opt->>'label','')), '') IS NULL THEN
        RAISE EXCEPTION 'Every scoring option needs a label.';
      END IF;
      IF (v_opt->>'rating') IS NULL
         OR (v_opt->>'rating') !~ '^[0-9]+(\.[0-9]+)?$'
         OR (v_opt->>'rating')::numeric < 0
         OR (v_opt->>'rating')::numeric > 5 THEN
        RAISE EXCEPTION 'Scoring option "%" needs a rating between 0 and 5.', v_opt->>'label';
      END IF;
    END LOOP;
  END IF;
END;
$function$;

-- Returns 'scoring_model_locked' when a per-employee change would fork the KPI's
-- scoring model away from the group definition; NULL when the change is safe.
CREATE OR REPLACE FUNCTION public.bu_console_scoring_model_lock(p_kpi_id uuid, p_changes jsonb)
 RETURNS text
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uom_type text;
  v_field text;
BEGIN
  IF p_changes IS NULL OR p_changes = '{}'::jsonb THEN RETURN NULL; END IF;

  -- The type itself and its option list are never per-employee.
  IF (p_changes ? 'uom_type') OR (p_changes ? 'qualitative_options') THEN
    RETURN 'scoring_model_locked';
  END IF;

  SELECT COALESCE(NULLIF(btrim(k.uom_type), ''), 'numeric')
    INTO v_uom_type
    FROM public.kpis k
   WHERE k.id = p_kpi_id;

  IF v_uom_type IS NULL OR v_uom_type NOT IN ('binary','tiered') THEN
    RETURN NULL;
  END IF;

  FOREACH v_field IN ARRAY ARRAY['r5','r4','r3','r2','r1','r0','criteria','threshold_mode','uom']
  LOOP
    IF p_changes ? v_field THEN
      RETURN 'scoring_model_locked';
    END IF;
  END LOOP;

  RETURN NULL;
END;
$function$;

REVOKE ALL ON FUNCTION public.bu_console_scoring_model_lock(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bu_console_scoring_model_lock(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bu_console_scoring_model_lock(uuid, jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.bu_console_row_override(p_kpi_id uuid, p_changes jsonb, p_allow_locked boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_run uuid;
  v_rec record;
  v_field text;
  v_applied jsonb;
  v_conflict text;
  v_eff_freq text;
  v_eff_anchor text;
  v_lock text;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT public.has_role(v_user, 'admin') THEN
    RETURN jsonb_build_object('authorized', false);
  END IF;

  FOR v_field IN SELECT jsonb_object_keys(COALESCE(p_changes, '{}'::jsonb))
  LOOP
    IF NOT (v_field = ANY (public.bu_console_editable_fields())) THEN
      RAISE EXCEPTION 'Field % is not editable from the Performance Console', v_field;
    END IF;
  END LOOP;

  PERFORM public.bu_console_validate_changes(p_changes);

  -- ADR-282 — scoring model stays group-owned.
  v_lock := public.bu_console_scoring_model_lock(p_kpi_id, p_changes);
  IF v_lock IS NOT NULL THEN
    RETURN jsonb_build_object('authorized', true, 'updated', 0, 'reason', v_lock);
  END IF;

  SELECT k.id, k.employee_id, k.status, k.review_period, k.review_year,
         k.category_id, k.kra_name, k.kpi_name, k.frequency, k.frequency_cycle_start,
         rs.final_score
    INTO v_rec
    FROM public.kpis k
    LEFT JOIN public.review_submissions rs ON rs.kpi_id = k.id
   WHERE k.id = p_kpi_id;

  IF v_rec.id IS NULL THEN
    RAISE EXCEPTION 'KPI not found';
  END IF;
  IF v_rec.final_score IS NOT NULL THEN
    RETURN jsonb_build_object('authorized', true, 'updated', 0, 'reason', 'final_score_locked');
  END IF;
  IF v_rec.status::text <> 'kra_set' AND NOT COALESCE(p_allow_locked, false) THEN
    RETURN jsonb_build_object('authorized', true, 'updated', 0, 'reason', 'past_kra_set');
  END IF;

  IF (p_changes ? 'frequency') OR (p_changes ? 'frequency_cycle_start') THEN
    v_eff_freq := COALESCE(NULLIF(btrim(COALESCE(p_changes->>'frequency','')), ''), v_rec.frequency);
    v_eff_anchor := CASE WHEN p_changes ? 'frequency_cycle_start'
                         THEN NULLIF(btrim(COALESCE(p_changes->>'frequency_cycle_start','')), '')
                         ELSE v_rec.frequency_cycle_start END;
    v_conflict := public.bu_console_cycle_anchor_conflict(p_kpi_id, v_eff_freq, v_eff_anchor);
    IF v_conflict IS NOT NULL THEN
      RETURN jsonb_build_object('authorized', true, 'updated', 0,
                                'reason', 'cycle_anchor_conflict', 'existing_anchor', v_conflict);
    END IF;
  END IF;

  INSERT INTO public.bu_console_edit_runs (
    performed_by, scope_kind, category_id, kra_name, kpi_name,
    review_period, review_year, changes, allow_locked
  ) VALUES (
    v_user, 'row', v_rec.category_id, v_rec.kra_name, v_rec.kpi_name,
    v_rec.review_period, v_rec.review_year, p_changes, COALESCE(p_allow_locked,false)
  ) RETURNING id INTO v_run;

  v_applied := public.bu_console_apply_kpi_changes(p_kpi_id, p_changes);

  IF (v_applied->'new') = '{}'::jsonb THEN
    UPDATE public.bu_console_edit_runs SET affected_rows = 0 WHERE id = v_run;
    RETURN jsonb_build_object('authorized', true, 'updated', 0, 'run_id', v_run, 'reason', 'no_change');
  END IF;

  INSERT INTO public.bu_console_edit_items (run_id, kpi_id, employee_id, old_values, new_values)
  VALUES (v_run, p_kpi_id, v_rec.employee_id, v_applied->'old', v_applied->'new');

  INSERT INTO public.bu_console_kpi_overrides (kpi_id, field, set_by, run_id)
  SELECT p_kpi_id, key, v_user, v_run FROM jsonb_object_keys(v_applied->'new') AS key
  ON CONFLICT (kpi_id, field) DO UPDATE SET set_by = EXCLUDED.set_by, run_id = EXCLUDED.run_id, updated_at = now();

  INSERT INTO public.kpi_audit_logs (kpi_id, action, performed_by, metadata)
  VALUES (p_kpi_id, 'BU_CONSOLE_ROW_OVERRIDE', v_user,
          jsonb_build_object('run_id', v_run, 'old', v_applied->'old', 'new', v_applied->'new'));

  UPDATE public.bu_console_edit_runs SET affected_rows = 1 WHERE id = v_run;

  RETURN jsonb_build_object('authorized', true, 'updated', 1, 'run_id', v_run,
                            'old', v_applied->'old', 'new', v_applied->'new');
END;
$function$;

CREATE OR REPLACE FUNCTION public.bu_console_bulk_row_overrides(p_rows jsonb, p_allow_locked boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_run uuid;
  v_item jsonb;
  v_kpi_id uuid;
  v_changes jsonb;
  v_field text;
  v_rec record;
  v_applied jsonb;
  v_updated int := 0;
  v_skipped jsonb := '[]'::jsonb;
  v_first record;
  v_lock text;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT public.has_role(v_user, 'admin') THEN
    RETURN jsonb_build_object('authorized', false);
  END IF;
  IF p_rows IS NULL OR jsonb_array_length(p_rows) = 0 THEN
    RETURN jsonb_build_object('authorized', true, 'updated', 0, 'skipped', '[]'::jsonb);
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_rows)
  LOOP
    v_changes := COALESCE(v_item->'changes', '{}'::jsonb);
    FOR v_field IN SELECT jsonb_object_keys(v_changes)
    LOOP
      IF NOT (v_field = ANY (public.bu_console_editable_fields())) THEN
        RAISE EXCEPTION 'Field % is not editable from the Performance Console', v_field;
      END IF;
    END LOOP;
    PERFORM public.bu_console_validate_changes(v_changes);
  END LOOP;

  SELECT k.category_id, k.kra_name, k.kpi_name, k.review_period, k.review_year
    INTO v_first
    FROM public.kpis k
   WHERE k.id = ((p_rows->0)->>'kpi_id')::uuid;

  INSERT INTO public.bu_console_edit_runs (
    performed_by, scope_kind, category_id, kra_name, kpi_name,
    review_period, review_year, changes, allow_locked
  ) VALUES (
    v_user, 'row_bulk', v_first.category_id, v_first.kra_name, v_first.kpi_name,
    v_first.review_period, v_first.review_year, p_rows, COALESCE(p_allow_locked,false)
  ) RETURNING id INTO v_run;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_rows)
  LOOP
    v_kpi_id := (v_item->>'kpi_id')::uuid;
    v_changes := COALESCE(v_item->'changes', '{}'::jsonb);
    IF v_changes = '{}'::jsonb THEN CONTINUE; END IF;

    -- ADR-282 — never fork the scoring model per employee; report and continue.
    v_lock := public.bu_console_scoring_model_lock(v_kpi_id, v_changes);
    IF v_lock IS NOT NULL THEN
      v_skipped := v_skipped || jsonb_build_object('kpi_id', v_kpi_id, 'reason', v_lock);
      CONTINUE;
    END IF;

    SELECT k.id, k.employee_id, k.status, rs.final_score
      INTO v_rec
      FROM public.kpis k
      LEFT JOIN public.review_submissions rs ON rs.kpi_id = k.id
     WHERE k.id = v_kpi_id;

    IF v_rec.id IS NULL THEN
      v_skipped := v_skipped || jsonb_build_object('kpi_id', v_kpi_id, 'reason', 'not_found');
      CONTINUE;
    END IF;
    IF v_rec.final_score IS NOT NULL THEN
      v_skipped := v_skipped || jsonb_build_object('kpi_id', v_kpi_id, 'reason', 'final_score_locked');
      CONTINUE;
    END IF;
    IF v_rec.status::text <> 'kra_set' AND NOT COALESCE(p_allow_locked, false) THEN
      v_skipped := v_skipped || jsonb_build_object('kpi_id', v_kpi_id, 'reason', 'past_kra_set');
      CONTINUE;
    END IF;

    v_applied := public.bu_console_apply_kpi_changes(v_kpi_id, v_changes);
    IF (v_applied->'new') = '{}'::jsonb THEN
      v_skipped := v_skipped || jsonb_build_object('kpi_id', v_kpi_id, 'reason', 'no_change');
      CONTINUE;
    END IF;

    INSERT INTO public.bu_console_edit_items (run_id, kpi_id, employee_id, old_values, new_values)
    VALUES (v_run, v_kpi_id, v_rec.employee_id, v_applied->'old', v_applied->'new');

    INSERT INTO public.bu_console_kpi_overrides (kpi_id, field, set_by, run_id)
    SELECT v_kpi_id, key, v_user, v_run FROM jsonb_object_keys(v_applied->'new') AS key
    ON CONFLICT (kpi_id, field) DO UPDATE SET set_by = EXCLUDED.set_by, run_id = EXCLUDED.run_id, updated_at = now();

    INSERT INTO public.kpi_audit_logs (kpi_id, action, performed_by, metadata)
    VALUES (v_kpi_id, 'BU_CONSOLE_ROW_OVERRIDE', v_user,
            jsonb_build_object('run_id', v_run, 'bulk', true, 'old', v_applied->'old', 'new', v_applied->'new'));

    v_updated := v_updated + 1;
  END LOOP;

  UPDATE public.bu_console_edit_runs
     SET affected_rows = v_updated, skipped_rows = jsonb_array_length(v_skipped)
   WHERE id = v_run;

  RETURN jsonb_build_object('authorized', true, 'run_id', v_run,
                            'updated', v_updated, 'skipped', v_skipped);
END;
$function$;