DROP FUNCTION IF EXISTS public.bu_console_group_edit_definition(uuid,text,text,text,integer,jsonb,uuid[],uuid[],uuid[],uuid[],text,text,boolean,boolean,boolean,boolean);

CREATE OR REPLACE FUNCTION public.bu_console_group_edit_definition(p_category_id uuid, p_kra_name text, p_kpi_name text, p_period text, p_year integer, p_changes jsonb, p_bu_ids uuid[] DEFAULT NULL::uuid[], p_dept_ids uuid[] DEFAULT NULL::uuid[], p_division_ids uuid[] DEFAULT NULL::uuid[], p_manager_ids uuid[] DEFAULT NULL::uuid[], p_title_key text DEFAULT NULL::text, p_variant_key text DEFAULT NULL::text, p_allow_locked boolean DEFAULT false, p_reset_overrides boolean DEFAULT false, p_dry_run boolean DEFAULT true, p_text_only boolean DEFAULT false, p_definition_id uuid DEFAULT NULL::uuid)
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
  v_partial_n int := 0;
  v_reasons text[] := ARRAY[]::text[];
  v_skip_summary jsonb;
  v_new_weight numeric;
  v_conflict text;
  v_eff_freq text;
  v_eff_anchor text;
  v_cycle_touched boolean;
  v_descriptive_only boolean := false;
  v_desc text[] := public.bu_console_descriptive_fields();
  v_desc_part jsonb;
  v_withheld jsonb;
  v_row_locked boolean;
  v_partial boolean;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT public.bu_console_can_write(v_user) THEN
    RETURN jsonb_build_object('authorized', false, 'preview', '[]'::jsonb, 'skipped_details', '[]'::jsonb);
  END IF;

  IF p_changes IS NULL OR p_changes = '{}'::jsonb THEN
    RETURN jsonb_build_object('authorized', true, 'dry_run', p_dry_run, 'will_write', 0, 'will_skip', 0,
                              'preview', '[]'::jsonb, 'skipped_details', '[]'::jsonb, 'skip_summary', '[]'::jsonb,
                              'edit_class', 'none');
  END IF;

  FOR v_field IN SELECT jsonb_object_keys(p_changes)
  LOOP
    IF NOT (v_field = ANY (public.bu_console_editable_fields())) THEN
      RAISE EXCEPTION 'Field % is not editable from the Performance Console', v_field;
    END IF;
  END LOOP;

  -- ADR-323 — the server derives the edit class from the actual change set.
  SELECT NOT EXISTS (
    SELECT 1
    FROM jsonb_object_keys(p_changes) AS changed(field)
    WHERE NOT (changed.field = ANY (v_desc))
  ) INTO v_descriptive_only;

  v_descriptive_only := v_descriptive_only AND v_is_admin;

  -- ADR-326 — the descriptive slice of a mixed change set, and what it withholds.
  SELECT COALESCE(jsonb_object_agg(kv.key, kv.value), '{}'::jsonb) INTO v_desc_part
  FROM jsonb_each(p_changes) kv
  WHERE kv.key = ANY (v_desc);

  SELECT COALESCE(jsonb_agg(k ORDER BY k), '[]'::jsonb) INTO v_withheld
  FROM jsonb_object_keys(p_changes) k
  WHERE NOT (k = ANY (v_desc));

  PERFORM public.bu_console_validate_changes(p_changes);
  v_cycle_touched := (p_changes ? 'frequency') OR (p_changes ? 'frequency_cycle_start');

  IF NOT p_dry_run THEN
    INSERT INTO public.bu_console_edit_runs (
      performed_by, scope_kind, category_id, kra_name, kpi_name, title_key, variant_key,
      review_period, review_year, changes, allow_locked, reset_overrides, text_only
    ) VALUES (
      v_user, 'group', p_category_id, p_kra_name, p_kpi_name, p_title_key, p_variant_key,
      p_period, p_year, p_changes, COALESCE(p_allow_locked,false), COALESCE(p_reset_overrides,false), v_descriptive_only
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
        -- ADR-337 — rollover-created rows can lose kpi_title, so the normalised
        -- title never matches. The definition id is the stable fallback key.
        (p_definition_id IS NOT NULL AND k.kpi_definition_id = p_definition_id)
        OR CASE WHEN p_title_key IS NOT NULL
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
    v_partial := false;

    v_row_locked := (v_rec.final_score IS NOT NULL)
                    OR (v_rec.status::text <> 'kra_set' AND NOT COALESCE(p_allow_locked, false));

    IF NOT v_is_admin AND v_rec.status::text = 'kra_set' THEN
      v_reason := 'kra_set_admin_only';
    ELSIF v_row_locked AND NOT v_descriptive_only THEN
      -- ADR-326 — apply the wording slice, withhold the protected fields.
      IF v_is_admin AND v_desc_part <> '{}'::jsonb THEN
        v_partial := true;
      ELSIF v_rec.final_score IS NOT NULL THEN
        v_reason := 'final_score_locked';
      ELSE
        v_reason := 'past_kra_set';
      END IF;
    END IF;

    IF v_reason IS NULL AND NOT v_partial AND v_cycle_touched THEN
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

    v_changes := CASE WHEN v_partial THEN v_desc_part ELSE p_changes END;

    -- Descriptive group standardisation is canonical for this selected group;
    -- per-employee override markers cannot silently remove text fields.
    IF NOT COALESCE(p_reset_overrides, false) AND NOT v_descriptive_only AND NOT v_partial THEN
      SELECT COALESCE(jsonb_object_agg(kv.key, kv.value), '{}'::jsonb) INTO v_changes
      FROM jsonb_each(p_changes) kv
      WHERE NOT EXISTS (
        SELECT 1 FROM public.bu_console_kpi_overrides o
        WHERE o.kpi_id = v_rec.id AND o.field = kv.key
      );
    END IF;

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
    IF v_partial THEN
      v_partial_n := v_partial_n + 1;
    END IF;

    IF p_dry_run THEN
      IF v_write_n <= v_detail_limit THEN
        v_preview := v_preview || jsonb_build_object(
          'kpi_id', v_rec.id, 'employee_id', v_rec.employee_id,
          'employee_name', v_rec.full_name, 'employee_code', v_rec.employee_code,
          'department_name', v_rec.department_name, 'business_unit_name', v_rec.business_unit_name,
          'current_status', v_rec.status::text, 'variant_key', v_rec.variant_key,
          'weightage', v_rec.weightage, 'target_value', v_rec.target_value,
          'text_only', (v_partial OR (v_descriptive_only AND (v_rec.final_score IS NOT NULL OR v_rec.status::text <> 'kra_set'))),
          'partial', v_partial,
          'withheld_fields', CASE WHEN v_partial THEN v_withheld ELSE '[]'::jsonb END,
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
                                   'text_only', (v_descriptive_only OR v_partial),
                                   'partial', v_partial,
                                   'withheld_fields', CASE WHEN v_partial THEN v_withheld ELSE '[]'::jsonb END,
                                   'edit_class', CASE WHEN v_descriptive_only THEN 'descriptive'
                                                      WHEN v_partial THEN 'partial_descriptive'
                                                      ELSE 'protected' END));
      ELSE
        v_write_n := v_write_n - 1;
        IF v_partial THEN v_partial_n := v_partial_n - 1; END IF;
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
    'partial_rows', v_partial_n,
    'withheld_fields', v_withheld,
    'updated', CASE WHEN p_dry_run THEN NULL ELSE v_write_n END,
    'detail_limit', v_detail_limit,
    'detail_truncated', (v_write_n > v_detail_limit OR v_skip_n > v_detail_limit),
    'skip_summary', v_skip_summary,
    'weightage_impact', v_weightage,
    'cycle_change', v_cycle_touched,
    'text_only', v_descriptive_only,
    'edit_class', CASE WHEN v_descriptive_only THEN 'descriptive'
                       WHEN v_partial_n > 0 THEN 'partial_descriptive'
                       ELSE 'protected' END,
    'anchor_conflicts', v_conflicts,
    'preview', v_preview,
    'skipped_details', v_skipped
  );
END;
$function$;

-- ADR-337 — rollover must carry the structured definition fields forward.
CREATE OR REPLACE FUNCTION public.batch_insert_kpis_with_rollover_flag(kpis_json jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  inserted_count integer;
BEGIN
  PERFORM set_config('app.rollover_batch', 'true', true);

  INSERT INTO public.kpis (
    employee_id, category_id, kra_name, kpi_name, target_value, uom, uom_type,
    weightage, frequency, sub_frequency, criteria, source_of_data,
    r5, r4, r3, r2, r1, r0, threshold_mode, qualitative_options,
    is_org_level, org_level_scope, ref_code, day_count_type,
    frequency_cycle_start, require_resubmit_reason,
    kpi_title, kpi_description, kpi_formula, kpi_scoring_logic, kpi_definition_id,
    review_period, review_year, status
  )
  SELECT
    (kpi->>'employee_id')::uuid,
    (kpi->>'category_id')::uuid,
    kpi->>'kra_name',
    kpi->>'kpi_name',
    (kpi->>'target_value')::numeric,
    kpi->>'uom',
    kpi->>'uom_type',
    (kpi->>'weightage')::numeric,
    kpi->>'frequency',
    kpi->>'sub_frequency',
    kpi->>'criteria',
    kpi->>'source_of_data',
    kpi->>'r5',
    kpi->>'r4',
    kpi->>'r3',
    kpi->>'r2',
    kpi->>'r1',
    kpi->>'r0',
    kpi->>'threshold_mode',
    CASE WHEN kpi->'qualitative_options' IS NOT NULL AND kpi->>'qualitative_options' != 'null' THEN kpi->'qualitative_options' ELSE NULL END,
    COALESCE((kpi->>'is_org_level')::boolean, false),
    kpi->>'org_level_scope',
    kpi->>'ref_code',
    kpi->>'day_count_type',
    kpi->>'frequency_cycle_start',
    COALESCE((kpi->>'require_resubmit_reason')::boolean, false),
    kpi->>'kpi_title',
    kpi->>'kpi_description',
    kpi->>'kpi_formula',
    kpi->>'kpi_scoring_logic',
    NULLIF(kpi->>'kpi_definition_id','')::uuid,
    kpi->>'review_period',
    (kpi->>'review_year')::integer,
    COALESCE(NULLIF(kpi->>'status',''), 'kra_set')::public.review_status
  FROM jsonb_array_elements(kpis_json) AS kpi
  ON CONFLICT (
    employee_id,
    (COALESCE(review_period, ''::text)),
    (COALESCE(review_year, 0)),
    kra_name,
    kpi_name
  ) DO NOTHING;

  GET DIAGNOSTICS inserted_count = ROW_COUNT;
  RETURN inserted_count;
END;
$function$;