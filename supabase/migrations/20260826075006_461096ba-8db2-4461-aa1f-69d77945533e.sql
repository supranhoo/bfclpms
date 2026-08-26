ALTER TABLE public.bu_console_edit_runs
  ADD COLUMN IF NOT EXISTS text_only boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.bu_console_descriptive_fields()
RETURNS text[]
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT ARRAY['kpi_title','kpi_description','criteria','source_of_data','kpi_formula','kpi_scoring_logic','uom']::text[]
$$;

DROP FUNCTION IF EXISTS public.bu_console_group_edit_definition(uuid, text, text, text, integer, jsonb, uuid[], uuid[], uuid[], uuid[], text, text, boolean, boolean, boolean);

CREATE OR REPLACE FUNCTION public.bu_console_group_edit_definition(
  p_category_id uuid,
  p_kra_name text,
  p_kpi_name text,
  p_period text,
  p_year integer,
  p_changes jsonb,
  p_bu_ids uuid[] DEFAULT NULL::uuid[],
  p_dept_ids uuid[] DEFAULT NULL::uuid[],
  p_division_ids uuid[] DEFAULT NULL::uuid[],
  p_manager_ids uuid[] DEFAULT NULL::uuid[],
  p_title_key text DEFAULT NULL::text,
  p_variant_key text DEFAULT NULL::text,
  p_allow_locked boolean DEFAULT false,
  p_reset_overrides boolean DEFAULT false,
  p_dry_run boolean DEFAULT true,
  p_text_only boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_is_admin boolean := public.has_role(auth.uid(), 'admin');
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
  v_text_only boolean := COALESCE(p_text_only, false);
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT public.bu_console_can_write(v_user) THEN
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

  -- ADR-321 — text-only standardisation. Admin-only, and the server re-derives
  -- the classification so the client can never widen it.
  IF v_text_only THEN
    IF NOT v_is_admin THEN
      RAISE EXCEPTION 'Text-only standardisation of locked rows is restricted to administrators';
    END IF;
    FOR v_field IN SELECT jsonb_object_keys(p_changes)
    LOOP
      IF NOT (v_field = ANY (public.bu_console_descriptive_fields())) THEN
        RAISE EXCEPTION 'Field % changes scoring or structure and cannot be applied as a text-only standardisation', v_field;
      END IF;
    END LOOP;
  END IF;

  PERFORM public.bu_console_validate_changes(p_changes);

  v_cycle_touched := (p_changes ? 'frequency') OR (p_changes ? 'frequency_cycle_start');

  IF NOT p_dry_run THEN
    INSERT INTO public.bu_console_edit_runs (
      performed_by, scope_kind, category_id, kra_name, kpi_name, title_key, variant_key,
      review_period, review_year, changes, allow_locked, reset_overrides, text_only
    ) VALUES (
      v_user, 'group', p_category_id, p_kra_name, p_kpi_name, p_title_key, p_variant_key,
      p_period, p_year, p_changes, COALESCE(p_allow_locked,false), COALESCE(p_reset_overrides,false), v_text_only
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

    -- POLICY §88 — an approved final score is immutable. ADR-321 narrows this to
    -- scoring data: wording may still be standardised on locked rows.
    IF NOT v_is_admin AND v_rec.status::text = 'kra_set' THEN
      v_reason := 'kra_set_admin_only';
    ELSIF v_rec.final_score IS NOT NULL AND NOT v_text_only THEN
      v_reason := 'final_score_locked';
    ELSIF v_rec.status::text <> 'kra_set' AND NOT COALESCE(p_allow_locked, false) AND NOT v_text_only THEN
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
          'text_only', (v_text_only AND (v_rec.final_score IS NOT NULL OR v_rec.status::text <> 'kra_set')),
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
                jsonb_build_object('run_id', v_run, 'old', v_applied->'old', 'new', v_applied->'new',
                                   'text_only', v_text_only));
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
    'text_only', v_text_only,
    'anchor_conflicts', v_conflicts,
    'preview', v_preview,
    'skipped_details', v_skipped
  );
END;
$function$;