-- ADR-275 — Performance Console: complete group / individual KPI editing.

-- 1. Whitelist the remaining definition fields.
CREATE OR REPLACE FUNCTION public.bu_console_editable_fields()
RETURNS text[]
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $function$
  SELECT ARRAY[
    'kpi_title','kpi_description','kpi_formula','kpi_scoring_logic',
    'weightage','target_value','uom','uom_type','frequency','threshold_mode',
    'qualitative_options','r5','r4','r3','r2','r1','r0',
    'kra_name','category_id','criteria','source_of_data',
    'frequency_cycle_start','day_count_type','is_org_level','org_level_scope',
    'require_resubmit_reason','is_frequency_locked'
  ]::text[]
$function$;

-- 2. Shared validation for the frequency / cycle-anchor pair (ADR-275).
CREATE OR REPLACE FUNCTION public.bu_console_validate_changes(p_changes jsonb)
RETURNS void
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public'
AS $function$
DECLARE
  v_freq text;
  v_anchor text;
BEGIN
  IF p_changes IS NULL THEN RETURN; END IF;

  v_freq := NULLIF(btrim(COALESCE(p_changes->>'frequency','')), '');

  IF v_freq IS NOT NULL AND v_freq IN ('Bi-Monthly','Quarterly','Half-Yearly','Yearly') THEN
    -- The anchor must be supplied in the same change set: without it the system
    -- cannot tell Jan-Feb from Feb-Mar (POLICY §54 v3).
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
END;
$function$;

-- 3. Per-row cycle anchor conflict pre-check, mirroring
--    enforce_intra_year_cycle_anchor_consistency so the console can *list*
--    conflicts in the preview instead of aborting mid-run.
CREATE OR REPLACE FUNCTION public.bu_console_cycle_anchor_conflict(
  p_kpi_id uuid,
  p_frequency text,
  p_anchor text
) RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_row record;
  v_months text[];
  v_conflict text;
BEGIN
  IF p_anchor IS NULL OR p_frequency IS NULL
     OR p_frequency NOT IN ('Bi-Monthly','Quarterly','Half-Yearly','Yearly') THEN
    RETURN NULL;
  END IF;

  SELECT k.employee_id, k.kpi_name, k.review_year INTO v_row
    FROM public.kpis k WHERE k.id = p_kpi_id;
  IF v_row.employee_id IS NULL THEN RETURN NULL; END IF;

  v_months := public.expand_cycle_window_months(p_frequency, p_anchor);
  IF v_months IS NULL OR array_length(v_months, 1) IS NULL THEN RETURN NULL; END IF;

  SELECT k2.frequency_cycle_start INTO v_conflict
    FROM public.kpis k2
   WHERE k2.id <> p_kpi_id
     AND k2.employee_id = v_row.employee_id
     AND k2.kpi_name = v_row.kpi_name
     AND k2.review_year = v_row.review_year
     AND k2.frequency = p_frequency
     AND k2.frequency_cycle_start IS NOT NULL
     AND k2.frequency_cycle_start <> p_anchor
     AND k2.review_period = ANY (v_months)
   LIMIT 1;

  RETURN v_conflict;
END;
$function$;

-- 4. Group edit: validate, and skip rows whose new cycle would clash.
CREATE OR REPLACE FUNCTION public.bu_console_group_edit_definition(
  p_category_id uuid, p_kra_name text, p_kpi_name text, p_period text, p_year integer,
  p_changes jsonb, p_bu_ids uuid[] DEFAULT NULL::uuid[], p_dept_ids uuid[] DEFAULT NULL::uuid[],
  p_division_ids uuid[] DEFAULT NULL::uuid[], p_manager_ids uuid[] DEFAULT NULL::uuid[],
  p_title_key text DEFAULT NULL::text, p_variant_key text DEFAULT NULL::text,
  p_allow_locked boolean DEFAULT false, p_reset_overrides boolean DEFAULT false,
  p_dry_run boolean DEFAULT true)
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
  v_reason text;
  v_changes jsonb;
  v_applied jsonb;
  v_preview jsonb := '[]'::jsonb;
  v_skipped jsonb := '[]'::jsonb;
  v_weightage jsonb := '[]'::jsonb;
  v_conflicts jsonb := '[]'::jsonb;
  v_detail_limit int := 500;
  v_write_n int := 0;
  v_skip_n int := 0;
  v_reasons text[] := ARRAY[]::text[];
  v_skip_summary jsonb;
  v_new_weight numeric;
  v_conflict text;
  v_eff_freq text;
  v_eff_anchor text;
  v_cycle_touched boolean;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT public.has_role(v_user, 'admin') THEN
    RETURN jsonb_build_object('authorized', false, 'preview', '[]'::jsonb, 'skipped_details', '[]'::jsonb);
  END IF;

  IF p_changes IS NULL OR p_changes = '{}'::jsonb THEN
    RETURN jsonb_build_object('authorized', true, 'dry_run', p_dry_run, 'will_write', 0, 'will_skip', 0,
                              'preview', '[]'::jsonb, 'skipped_details', '[]'::jsonb, 'skip_summary', '[]'::jsonb);
  END IF;

  FOR v_field IN SELECT jsonb_object_keys(p_changes)
  LOOP
    IF NOT (v_field = ANY (public.bu_console_editable_fields())) THEN
      RAISE EXCEPTION 'Field % is not editable from the Performance Console', v_field;
    END IF;
  END LOOP;

  PERFORM public.bu_console_validate_changes(p_changes);

  v_cycle_touched := (p_changes ? 'frequency') OR (p_changes ? 'frequency_cycle_start');

  IF NOT p_dry_run THEN
    INSERT INTO public.bu_console_edit_runs (
      performed_by, scope_kind, category_id, kra_name, kpi_name, title_key, variant_key,
      review_period, review_year, changes, allow_locked, reset_overrides
    ) VALUES (
      v_user, 'group', p_category_id, p_kra_name, p_kpi_name, p_title_key, p_variant_key,
      p_period, p_year, p_changes, COALESCE(p_allow_locked,false), COALESCE(p_reset_overrides,false)
    ) RETURNING id INTO v_run;
  END IF;

  FOR v_rec IN
    SELECT k.id, k.employee_id, k.status, k.weightage, k.target_value,
           k.frequency, k.frequency_cycle_start,
           p.full_name, p.employee_code,
           d.name AS department_name, bu.name AS business_unit_name,
           rs.final_score,
           public.bu_console_variant_key(k.kpi_description, k.kpi_formula, k.kpi_scoring_logic, k.target_value) AS variant_key
    FROM public.kpis k
    JOIN public.profiles p ON p.id = k.employee_id AND p.is_active = true
    LEFT JOIN public.departments d ON d.id = p.department_id
    LEFT JOIN public.business_units bu ON bu.id = d.business_unit_id
    LEFT JOIN public.review_submissions rs ON rs.kpi_id = k.id
    WHERE k.review_period = p_period
      AND k.review_year = p_year
      AND (p_category_id IS NULL OR k.category_id = p_category_id)
      AND public.normalize_kpi_text(k.kra_name) = public.normalize_kpi_text(p_kra_name)
      AND (
        CASE WHEN p_title_key IS NOT NULL
          THEN public.normalize_kpi_text(COALESCE(NULLIF(btrim(k.kpi_title), ''), k.kpi_name)) = p_title_key
          ELSE public.normalize_kpi_text(k.kpi_name) = public.normalize_kpi_text(p_kpi_name)
        END
      )
      AND (p_variant_key IS NULL OR public.bu_console_variant_key(k.kpi_description, k.kpi_formula, k.kpi_scoring_logic, k.target_value) = p_variant_key)
      AND (p_bu_ids IS NULL OR array_length(p_bu_ids,1) IS NULL OR d.business_unit_id = ANY(p_bu_ids))
      AND (p_dept_ids IS NULL OR array_length(p_dept_ids,1) IS NULL OR p.department_id = ANY(p_dept_ids))
      AND (p_division_ids IS NULL OR array_length(p_division_ids,1) IS NULL OR d.business_unit_id IN (SELECT bu_f.id FROM public.business_units bu_f WHERE bu_f.division_id = ANY(p_division_ids)))
      AND (p_manager_ids IS NULL OR array_length(p_manager_ids,1) IS NULL OR p.reporting_manager_id = ANY(p_manager_ids))
    ORDER BY p.full_name
  LOOP
    v_reason := NULL;

    -- POLICY §88 — an approved final score is immutable, no exception.
    IF v_rec.final_score IS NOT NULL THEN
      v_reason := 'final_score_locked';
    ELSIF v_rec.status::text <> 'kra_set' AND NOT COALESCE(p_allow_locked, false) THEN
      v_reason := 'past_kra_set';
    END IF;

    -- ADR-275 — a cycle move that would overlap another cycle is reported,
    -- never attempted (the DB trigger stays the last line of defence).
    IF v_reason IS NULL AND v_cycle_touched THEN
      v_eff_freq := COALESCE(NULLIF(btrim(COALESCE(p_changes->>'frequency','')), ''), v_rec.frequency);
      v_eff_anchor := CASE WHEN p_changes ? 'frequency_cycle_start'
                           THEN NULLIF(btrim(COALESCE(p_changes->>'frequency_cycle_start','')), '')
                           ELSE v_rec.frequency_cycle_start END;
      v_conflict := public.bu_console_cycle_anchor_conflict(v_rec.id, v_eff_freq, v_eff_anchor);
      IF v_conflict IS NOT NULL THEN
        v_reason := 'cycle_anchor_conflict';
        IF jsonb_array_length(v_conflicts) < v_detail_limit THEN
          v_conflicts := v_conflicts || jsonb_build_object(
            'kpi_id', v_rec.id, 'employee_id', v_rec.employee_id,
            'employee_name', v_rec.full_name, 'employee_code', v_rec.employee_code,
            'existing_anchor', v_conflict, 'new_anchor', v_eff_anchor, 'frequency', v_eff_freq);
        END IF;
      END IF;
    END IF;

    IF v_reason IS NOT NULL THEN
      v_skip_n := v_skip_n + 1;
      v_reasons := v_reasons || v_reason;
      IF v_skip_n <= v_detail_limit THEN
        v_skipped := v_skipped || jsonb_build_object(
          'kpi_id', v_rec.id, 'employee_id', v_rec.employee_id,
          'employee_name', v_rec.full_name, 'employee_code', v_rec.employee_code,
          'department_name', v_rec.department_name, 'business_unit_name', v_rec.business_unit_name,
          'current_status', v_rec.status::text, 'variant_key', v_rec.variant_key, 'reason', v_reason);
      END IF;
      CONTINUE;
    END IF;

    -- Individually overridden fields survive a group edit unless the admin resets them.
    v_changes := p_changes;
    IF NOT COALESCE(p_reset_overrides, false) THEN
      SELECT COALESCE(jsonb_object_agg(kv.key, kv.value), '{}'::jsonb) INTO v_changes
      FROM jsonb_each(p_changes) kv
      WHERE NOT EXISTS (
        SELECT 1 FROM public.bu_console_kpi_overrides o
        WHERE o.kpi_id = v_rec.id AND o.field = kv.key
      );
    END IF;

    -- Frequency and its anchor always travel together.
    IF (v_changes ? 'frequency') AND (p_changes ? 'frequency_cycle_start') AND NOT (v_changes ? 'frequency_cycle_start') THEN
      v_changes := v_changes || jsonb_build_object('frequency_cycle_start', p_changes->'frequency_cycle_start');
    END IF;

    IF v_changes = '{}'::jsonb THEN
      v_skip_n := v_skip_n + 1;
      v_reasons := v_reasons || 'individual_override';
      IF v_skip_n <= v_detail_limit THEN
        v_skipped := v_skipped || jsonb_build_object(
          'kpi_id', v_rec.id, 'employee_id', v_rec.employee_id,
          'employee_name', v_rec.full_name, 'employee_code', v_rec.employee_code,
          'department_name', v_rec.department_name, 'business_unit_name', v_rec.business_unit_name,
          'current_status', v_rec.status::text, 'variant_key', v_rec.variant_key,
          'reason', 'individual_override');
      END IF;
      CONTINUE;
    END IF;

    v_write_n := v_write_n + 1;

    IF p_dry_run THEN
      IF v_write_n <= v_detail_limit THEN
        v_preview := v_preview || jsonb_build_object(
          'kpi_id', v_rec.id, 'employee_id', v_rec.employee_id,
          'employee_name', v_rec.full_name, 'employee_code', v_rec.employee_code,
          'department_name', v_rec.department_name, 'business_unit_name', v_rec.business_unit_name,
          'current_status', v_rec.status::text, 'variant_key', v_rec.variant_key,
          'weightage', v_rec.weightage, 'target_value', v_rec.target_value,
          'fields', (SELECT COALESCE(jsonb_agg(key ORDER BY key), '[]'::jsonb) FROM jsonb_object_keys(v_changes) key));
      END IF;

      IF v_changes ? 'weightage' THEN
        v_new_weight := NULLIF(v_changes->>'weightage','')::numeric;
        v_weightage := v_weightage || jsonb_build_object(
          'employee_id', v_rec.employee_id,
          'employee_name', v_rec.full_name,
          'employee_code', v_rec.employee_code,
          'current_total', (SELECT COALESCE(SUM(k2.weightage),0) FROM public.kpis k2
                             WHERE k2.employee_id = v_rec.employee_id
                               AND k2.review_period = p_period AND k2.review_year = p_year),
          'new_total', (SELECT COALESCE(SUM(CASE WHEN k2.id = v_rec.id THEN v_new_weight ELSE k2.weightage END),0)
                          FROM public.kpis k2
                         WHERE k2.employee_id = v_rec.employee_id
                           AND k2.review_period = p_period AND k2.review_year = p_year));
      END IF;
    ELSE
      v_applied := public.bu_console_apply_kpi_changes(v_rec.id, v_changes);

      IF (v_applied->'new') <> '{}'::jsonb THEN
        INSERT INTO public.bu_console_edit_items (run_id, kpi_id, employee_id, old_values, new_values)
        VALUES (v_run, v_rec.id, v_rec.employee_id, v_applied->'old', v_applied->'new');

        INSERT INTO public.kpi_audit_logs (kpi_id, action, performed_by, metadata)
        VALUES (v_rec.id, 'BU_CONSOLE_GROUP_EDIT', v_user,
                jsonb_build_object('run_id', v_run, 'old', v_applied->'old', 'new', v_applied->'new'));
      ELSE
        v_write_n := v_write_n - 1;
      END IF;
    END IF;
  END LOOP;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('reason', r.reason, 'count', r.n) ORDER BY r.n DESC), '[]'::jsonb)
    INTO v_skip_summary
  FROM (SELECT reason, count(*)::int AS n FROM unnest(v_reasons) AS reason GROUP BY reason) r;

  IF NOT p_dry_run THEN
    UPDATE public.bu_console_edit_runs
       SET affected_rows = v_write_n, skipped_rows = v_skip_n
     WHERE id = v_run;
  END IF;

  RETURN jsonb_build_object(
    'authorized', true,
    'dry_run', p_dry_run,
    'run_id', v_run,
    'will_write', v_write_n,
    'will_skip', v_skip_n,
    'updated', CASE WHEN p_dry_run THEN NULL ELSE v_write_n END,
    'detail_limit', v_detail_limit,
    'detail_truncated', (v_write_n > v_detail_limit OR v_skip_n > v_detail_limit),
    'skip_summary', v_skip_summary,
    'weightage_impact', v_weightage,
    'cycle_change', v_cycle_touched,
    'anchor_conflicts', v_conflicts,
    'preview', v_preview,
    'skipped_details', v_skipped
  );
END;
$function$;

-- 5. Row override: same validation + conflict guard.
CREATE OR REPLACE FUNCTION public.bu_console_row_override(
  p_kpi_id uuid, p_changes jsonb, p_allow_locked boolean DEFAULT false)
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

-- 6. Bulk per-employee tuning: many employees, one undoable run (ADR-275 §4).
CREATE OR REPLACE FUNCTION public.bu_console_bulk_row_overrides(
  p_rows jsonb,
  p_allow_locked boolean DEFAULT false)
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

-- 7. Reset one employee's override back to the group definition.
CREATE OR REPLACE FUNCTION public.bu_console_clear_row_overrides(
  p_kpi_id uuid,
  p_fields text[] DEFAULT NULL::text[])
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_n int;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT public.has_role(v_user, 'admin') THEN
    RETURN jsonb_build_object('authorized', false);
  END IF;

  DELETE FROM public.bu_console_kpi_overrides o
   WHERE o.kpi_id = p_kpi_id
     AND (p_fields IS NULL OR array_length(p_fields,1) IS NULL OR o.field = ANY(p_fields));
  GET DIAGNOSTICS v_n = ROW_COUNT;

  INSERT INTO public.kpi_audit_logs (kpi_id, action, performed_by, metadata)
  VALUES (p_kpi_id, 'BU_CONSOLE_OVERRIDE_CLEARED', v_user,
          jsonb_build_object('fields', p_fields, 'cleared', v_n));

  RETURN jsonb_build_object('authorized', true, 'cleared', v_n);
END;
$function$;

-- 8. Detail RPC: expose the newly editable fields + each row's override list.
CREATE OR REPLACE FUNCTION public.bu_console_kpi_detail(
  p_category_id uuid, p_kra_name text, p_kpi_name text, p_period text, p_year integer,
  p_bu_ids uuid[] DEFAULT NULL::uuid[], p_dept_ids uuid[] DEFAULT NULL::uuid[],
  p_division_ids uuid[] DEFAULT NULL::uuid[], p_manager_ids uuid[] DEFAULT NULL::uuid[],
  p_page integer DEFAULT 1, p_page_size integer DEFAULT 200,
  p_title_key text DEFAULT NULL::text, p_variant_key text DEFAULT NULL::text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_rows jsonb;
  v_total integer;
  v_size integer := LEAST(GREATEST(COALESCE(p_page_size,200),1),200);
  v_offset integer := (GREATEST(COALESCE(p_page,1),1) - 1) * v_size;
  v_meta jsonb;
BEGIN
  IF NOT public.bu_console_can_read(auth.uid()) THEN
    RETURN jsonb_build_object('authorized', false, 'rows', '[]'::jsonb, 'total', 0);
  END IF;

  WITH scoped AS (
    SELECT k.id AS kpi_id,
           k.employee_id,
           k.weightage,
           k.target_value,
           k.uom,
           COALESCE(NULLIF(btrim(k.uom_type), ''), 'numeric') AS uom_type,
           k.qualitative_options,
           k.frequency,
           k.frequency_cycle_start,
           k.sub_frequency,
           k.day_count_type,
           k.is_frequency_locked,
           k.require_resubmit_reason,
           k.org_level_scope,
           k.ref_code,
           k.status::text AS status,
           k.criteria,
           k.source_of_data,
           k.category_id,
           k.kra_name,
           k.threshold_mode,
           k.r0, k.r1, k.r2, k.r3, k.r4, k.r5,
           k.is_org_level,
           k.kpi_name,
           k.kpi_title,
           k.kpi_description,
           k.kpi_formula,
           k.kpi_scoring_logic,
           public.bu_console_variant_key(k.kpi_description, k.kpi_formula, k.kpi_scoring_logic, k.target_value) AS variant_key,
           p.full_name,
           p.employee_code,
           p.department_id,
           d.name AS department_name,
           d.business_unit_id AS business_unit_id,
           bu.name AS business_unit_name
    FROM public.kpis k
    JOIN public.profiles p ON p.id = k.employee_id AND p.is_active = true
    LEFT JOIN public.departments d ON d.id = p.department_id
    LEFT JOIN public.business_units bu ON bu.id = d.business_unit_id
    WHERE k.review_period = p_period
      AND k.review_year = p_year
      AND (p_category_id IS NULL OR k.category_id = p_category_id)
      AND public.normalize_kpi_text(k.kra_name) = public.normalize_kpi_text(p_kra_name)
      AND (
        CASE WHEN p_title_key IS NOT NULL
          THEN public.normalize_kpi_text(COALESCE(NULLIF(btrim(k.kpi_title), ''), k.kpi_name)) = p_title_key
          ELSE public.normalize_kpi_text(k.kpi_name) = public.normalize_kpi_text(p_kpi_name)
        END
      )
      AND (p_variant_key IS NULL OR public.bu_console_variant_key(k.kpi_description, k.kpi_formula, k.kpi_scoring_logic, k.target_value) = p_variant_key)
      AND (p_bu_ids IS NULL OR array_length(p_bu_ids,1) IS NULL OR d.business_unit_id = ANY(p_bu_ids))
      AND (p_dept_ids IS NULL OR array_length(p_dept_ids,1) IS NULL OR p.department_id = ANY(p_dept_ids))
      AND (p_division_ids IS NULL OR array_length(p_division_ids,1) IS NULL OR d.business_unit_id IN (SELECT bu_f.id FROM public.business_units bu_f WHERE bu_f.division_id = ANY(p_division_ids)))
      AND (p_manager_ids IS NULL OR array_length(p_manager_ids,1) IS NULL OR p.reporting_manager_id = ANY(p_manager_ids))
  ),
  counted AS (SELECT count(*)::int AS total FROM scoped),
  page AS (
    SELECT s.*, rs.achieved_value, rs.self_achieved_value, rs.final_score, rs.final_rating,
           rs.self_score, rs.manager_score, rs.is_na,
           (SELECT COALESCE(jsonb_agg(o.field ORDER BY o.field), '[]'::jsonb)
              FROM public.bu_console_kpi_overrides o WHERE o.kpi_id = s.kpi_id) AS override_fields
    FROM scoped s
    LEFT JOIN public.review_submissions rs ON rs.kpi_id = s.kpi_id
    ORDER BY s.full_name
    OFFSET v_offset LIMIT v_size
  )
  SELECT (SELECT total FROM counted),
         COALESCE((SELECT jsonb_agg(jsonb_build_object(
            'kpi_id', kpi_id,
            'employee_id', employee_id,
            'employee_name', full_name,
            'employee_code', employee_code,
            'department_id', department_id,
            'department_name', department_name,
            'business_unit_id', business_unit_id,
            'business_unit_name', business_unit_name,
            'weightage', weightage,
            'target_value', target_value,
            'uom', uom,
            'uom_type', uom_type,
            'qualitative_options', qualitative_options,
            'frequency', frequency,
            'frequency_cycle_start', frequency_cycle_start,
            'sub_frequency', sub_frequency,
            'day_count_type', day_count_type,
            'is_frequency_locked', is_frequency_locked,
            'require_resubmit_reason', require_resubmit_reason,
            'is_org_level', is_org_level,
            'org_level_scope', org_level_scope,
            'ref_code', ref_code,
            'criteria', criteria,
            'source_of_data', source_of_data,
            'threshold_mode', threshold_mode,
            'r0', r0, 'r1', r1, 'r2', r2, 'r3', r3, 'r4', r4, 'r5', r5,
            'status', status,
            'is_na', is_na,
            'variant_key', variant_key,
            'override_fields', override_fields,
            'kpi_title', kpi_title,
            'kpi_description', kpi_description,
            'kpi_formula', kpi_formula,
            'kpi_scoring_logic', kpi_scoring_logic,
            'achieved_value', COALESCE(achieved_value, self_achieved_value),
            'self_score', self_score,
            'manager_score', manager_score,
            'final_score', final_score,
            'final_rating', final_rating
         )) FROM page), '[]'::jsonb),
         COALESCE((SELECT jsonb_build_object(
            'criteria', max(criteria), 'uom', max(uom), 'frequency', max(frequency),
            'frequency_cycle_start', max(frequency_cycle_start),
            'frequency_cycle_starts', to_jsonb(array_agg(DISTINCT frequency_cycle_start) FILTER (WHERE frequency_cycle_start IS NOT NULL)),
            'frequencies', to_jsonb(array_agg(DISTINCT frequency) FILTER (WHERE frequency IS NOT NULL)),
            'day_count_type', max(day_count_type),
            'org_level_scope', max(org_level_scope),
            'require_resubmit_reason', bool_or(COALESCE(require_resubmit_reason,false)),
            'is_frequency_locked', bool_or(COALESCE(is_frequency_locked,false)),
            'threshold_mode', max(threshold_mode),
            'source_of_data', max(source_of_data),
            'category_id', (array_agg(category_id) FILTER (WHERE category_id IS NOT NULL))[1],
            'kra_name', max(kra_name),
            'target_value', max(target_value),
            'r0', max(r0),'r1', max(r1),'r2', max(r2),'r3', max(r3),'r4', max(r4),'r5', max(r5),
            'kpi_title', max(kpi_title),
            'kpi_description', max(kpi_description),
            'kpi_formula', max(kpi_formula),
            'kpi_scoring_logic', max(kpi_scoring_logic),
            'kpi_name', max(kpi_name),
            'uom_type', (array_agg(uom_type ORDER BY uom_type))[1],
            'uom_types', to_jsonb(array_agg(DISTINCT uom_type)),
            'qualitative_options', (array_agg(qualitative_options) FILTER (WHERE qualitative_options IS NOT NULL))[1],
            'variant_count', count(DISTINCT variant_key)::int,
            'is_org_level', bool_or(COALESCE(is_org_level,false))
         ) FROM scoped), '{}'::jsonb)
  INTO v_total, v_rows, v_meta;

  RETURN jsonb_build_object(
    'authorized', true,
    'total', COALESCE(v_total,0),
    'page', GREATEST(COALESCE(p_page,1),1),
    'page_size', v_size,
    'definition', v_meta,
    'rows', v_rows
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.bu_console_validate_changes(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bu_console_cycle_anchor_conflict(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bu_console_bulk_row_overrides(jsonb, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bu_console_clear_row_overrides(uuid, text[]) TO authenticated;