-- =============================================================================
-- Bulk Sign-off: 5th rung — compute rating from achievement (POLICY §111.7.a)
-- v2.66.13.9 — adds per-employee achievement-based fallback to the bulk
-- sign-off cascade. Strictly additive: existing 4-rung behavior unchanged.
-- =============================================================================

-- Helper: compute rating 0-5 from a kpis row's own thresholds + achieved_value.
-- Mirrors `src/lib/ratingCalculation.ts` (absolute mode, Date UOM, % UOM,
-- binary/tiered passthrough). Returns NULL when not computable.
CREATE OR REPLACE FUNCTION public.fn_compute_rating_from_achievement(
  p_kpi public.kpis,
  p_achieved_value numeric,
  p_achieved_text text DEFAULT NULL
)
RETURNS numeric
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public'
AS $$
DECLARE
  v_criteria text := lower(COALESCE(p_kpi.criteria, 'higher is better'));
  v_lower_better boolean := position('lower' in v_criteria) > 0;
  v_uom text := COALESCE(p_kpi.uom, '');
  v_uom_type text := COALESCE(p_kpi.uom_type, 'numeric');
  v_achieved numeric := p_achieved_value;
  v_r5 numeric;
  v_r4 numeric;
  v_r3 numeric;
  v_r2 numeric;
  v_r1 numeric;
  v_qual jsonb;
  v_opt jsonb;
BEGIN
  IF p_achieved_value IS NULL AND (p_achieved_text IS NULL OR p_achieved_text = '') THEN
    RETURN NULL;
  END IF;

  -- Qualitative passthrough: try matching the achieved label against options.
  IF v_uom_type IN ('binary','tiered') THEN
    v_qual := COALESCE(p_kpi.qualitative_options, '[]'::jsonb);
    IF p_achieved_text IS NOT NULL AND p_achieved_text <> '' THEN
      FOR v_opt IN SELECT * FROM jsonb_array_elements(v_qual) LOOP
        IF v_opt->>'label' = p_achieved_text THEN
          RETURN (v_opt->>'rating')::numeric;
        END IF;
      END LOOP;
    END IF;
    -- Reverse-map: achieved numeric == option.rating
    IF v_achieved IS NOT NULL THEN
      FOR v_opt IN SELECT * FROM jsonb_array_elements(v_qual) LOOP
        IF (v_opt->>'rating')::numeric = v_achieved THEN
          RETURN v_achieved;
        END IF;
      END LOOP;
    END IF;
    -- Fall through to numeric threshold compare if thresholds exist.
  END IF;

  -- Parse R5-R1 as numerics (strip operators/%, swap comma).
  -- Simple numeric cast covers most KPI master data; non-numeric strings → NULL.
  BEGIN v_r5 := NULLIF(regexp_replace(COALESCE(p_kpi.r5,''), '[^0-9.\-]', '', 'g'),'')::numeric; EXCEPTION WHEN OTHERS THEN v_r5 := NULL; END;
  BEGIN v_r4 := NULLIF(regexp_replace(COALESCE(p_kpi.r4,''), '[^0-9.\-]', '', 'g'),'')::numeric; EXCEPTION WHEN OTHERS THEN v_r4 := NULL; END;
  BEGIN v_r3 := NULLIF(regexp_replace(COALESCE(p_kpi.r3,''), '[^0-9.\-]', '', 'g'),'')::numeric; EXCEPTION WHEN OTHERS THEN v_r3 := NULL; END;
  BEGIN v_r2 := NULLIF(regexp_replace(COALESCE(p_kpi.r2,''), '[^0-9.\-]', '', 'g'),'')::numeric; EXCEPTION WHEN OTHERS THEN v_r2 := NULL; END;
  BEGIN v_r1 := NULLIF(regexp_replace(COALESCE(p_kpi.r1,''), '[^0-9.\-]', '', 'g'),'')::numeric; EXCEPTION WHEN OTHERS THEN v_r1 := NULL; END;

  IF v_achieved IS NULL THEN
    BEGIN v_achieved := NULLIF(regexp_replace(p_achieved_text, '[^0-9.\-]', '', 'g'),'')::numeric;
    EXCEPTION WHEN OTHERS THEN v_achieved := NULL; END;
  END IF;
  IF v_achieved IS NULL THEN RETURN NULL; END IF;

  -- Need at least one threshold to score.
  IF v_r5 IS NULL AND v_r4 IS NULL AND v_r3 IS NULL AND v_r2 IS NULL AND v_r1 IS NULL THEN
    RETURN NULL;
  END IF;

  -- Date UOM is Lower-is-Better against absolute day thresholds.
  IF v_uom = 'Date' THEN
    v_lower_better := true;
  END IF;

  IF v_lower_better THEN
    IF v_r5 IS NOT NULL AND v_achieved <= v_r5 THEN RETURN 5;
    ELSIF v_r4 IS NOT NULL AND v_achieved <= v_r4 THEN RETURN 4;
    ELSIF v_r3 IS NOT NULL AND v_achieved <= v_r3 THEN RETURN 3;
    ELSIF v_r2 IS NOT NULL AND v_achieved <= v_r2 THEN RETURN 2;
    ELSIF v_r1 IS NOT NULL AND v_achieved <= v_r1 THEN RETURN 1;
    ELSE RETURN 0;
    END IF;
  ELSE
    IF v_r5 IS NOT NULL AND v_achieved >= v_r5 THEN RETURN 5;
    ELSIF v_r4 IS NOT NULL AND v_achieved >= v_r4 THEN RETURN 4;
    ELSIF v_r3 IS NOT NULL AND v_achieved >= v_r3 THEN RETURN 3;
    ELSIF v_r2 IS NOT NULL AND v_achieved >= v_r2 THEN RETURN 2;
    ELSIF v_r1 IS NOT NULL AND v_achieved >= v_r1 THEN RETURN 1;
    ELSE RETURN 0;
    END IF;
  END IF;
END;
$$;

COMMENT ON FUNCTION public.fn_compute_rating_from_achievement(public.kpis, numeric, text) IS
  'Computes 0-5 rating from a KPIs row''s own R0-R5 thresholds + achieved value. Per-employee — never share across employees. Mirrors src/lib/ratingCalculation.ts.';

-- =============================================================================
-- Extend bulk_write_stage_scores with the 5th rung
-- Strictly additive: only fires when v_score IS NULL after the 4-rung cascade.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.bulk_write_stage_scores(p_stage text, p_cells jsonb, p_batch_reason text DEFAULT NULL::text, p_attachment_urls jsonb DEFAULT '[]'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_actor uuid := auth.uid();
  v_batch_id uuid := gen_random_uuid();
  v_cell jsonb;
  v_sub_id uuid;
  v_score numeric;
  v_inherited_from text;
  v_cell_remarks text;
  v_effective_remarks text;
  v_exp_ver int;
  v_cur record;
  v_kpi public.kpis;
  v_achieved numeric;
  v_applied int := 0;
  v_skipped jsonb := '[]'::jsonb;
  v_reason text;
  v_hr_override_count int := 0;
  v_period text := NULL;
  v_year  int  := NULL;
  v_affected_kpi_ids uuid[] := ARRAY[]::uuid[];
  v_reconcile_result jsonb;
  v_advanced_count int := 0;
  v_attach jsonb;
  v_attach_count int;
  v_shared_remark text;
BEGIN
  IF NOT public.is_bulk_review_enabled() THEN
    RAISE EXCEPTION 'feature disabled' USING ERRCODE = 'P0001';
  END IF;

  IF p_stage NOT IN ('manager','skip_level','hr_pms','auditor') THEN
    RAISE EXCEPTION 'invalid stage: %', p_stage;
  END IF;

  IF jsonb_typeof(p_cells) <> 'array' THEN
    RAISE EXCEPTION 'p_cells must be a json array';
  END IF;

  v_shared_remark := COALESCE(btrim(p_batch_reason), '');
  IF length(v_shared_remark) < 10 THEN
    RAISE EXCEPTION 'remark required (min 10 characters)' USING ERRCODE = '22023';
  END IF;

  v_attach := COALESCE(p_attachment_urls, '[]'::jsonb);
  IF jsonb_typeof(v_attach) <> 'array' THEN
    RAISE EXCEPTION 'p_attachment_urls must be a json array of urls';
  END IF;
  v_attach_count := jsonb_array_length(v_attach);
  IF v_attach_count > 5 THEN
    RAISE EXCEPTION 'too many attachments (max 5)';
  END IF;

  FOR v_cell IN SELECT * FROM jsonb_array_elements(p_cells)
  LOOP
    v_sub_id := (v_cell->>'submission_id')::uuid;
    v_score  := NULLIF(v_cell->>'score','')::numeric;
    v_cell_remarks := v_cell->>'remarks';
    v_exp_ver:= NULLIF(v_cell->>'expected_row_version','')::int;
    v_reason := NULL;
    v_inherited_from := NULL;

    SELECT id, kpi_id, final_score, auditor_score, hr_pms_score,
           skip_level_score, manager_score, self_score, achieved_value, row_version,
           manager_evidence_urls, skip_level_evidence_urls,
           hr_pms_evidence_urls, auditor_evidence_urls
      INTO v_cur
      FROM public.review_submissions
     WHERE id = v_sub_id
     FOR UPDATE;

    IF NOT FOUND THEN
      v_reason := 'not_found';
    ELSIF v_cur.final_score IS NOT NULL THEN
      v_reason := 'final_locked';
    ELSIF v_cur.self_score IS NULL THEN
      v_reason := 'self_not_submitted';
    ELSIF p_stage = 'hr_pms' AND v_cur.auditor_score IS NOT NULL THEN
      v_reason := 'auditor_takes_precedence';
    ELSIF v_exp_ver IS NOT NULL AND v_cur.row_version <> v_exp_ver THEN
      v_reason := 'row_version_conflict';
    END IF;

    -- Inheritance cascade (POLICY §111.7.a).
    IF v_reason IS NULL AND v_score IS NULL THEN
      IF p_stage = 'manager' THEN
        v_score := v_cur.self_score;
        v_inherited_from := 'self';
      ELSIF p_stage = 'skip_level' THEN
        v_score := COALESCE(v_cur.manager_score, v_cur.self_score);
        v_inherited_from := CASE WHEN v_cur.manager_score IS NOT NULL THEN 'manager' ELSE 'self' END;
      ELSIF p_stage = 'hr_pms' THEN
        v_score := COALESCE(v_cur.skip_level_score, v_cur.manager_score, v_cur.self_score);
        v_inherited_from := CASE
          WHEN v_cur.skip_level_score IS NOT NULL THEN 'skip_level'
          WHEN v_cur.manager_score IS NOT NULL THEN 'manager'
          ELSE 'self' END;
      ELSIF p_stage = 'auditor' THEN
        v_score := COALESCE(v_cur.hr_pms_score, v_cur.skip_level_score, v_cur.manager_score, v_cur.self_score);
        v_inherited_from := CASE
          WHEN v_cur.hr_pms_score IS NOT NULL THEN 'hr_pms'
          WHEN v_cur.skip_level_score IS NOT NULL THEN 'skip_level'
          WHEN v_cur.manager_score IS NOT NULL THEN 'manager'
          ELSE 'self' END;
      END IF;

      -- 5th rung — compute from achievement using THIS row's own kpis rule
      -- (POLICY §111.7.a, v2.66.13.9). Per-employee; never shared.
      IF v_score IS NULL THEN
        SELECT * INTO v_kpi FROM public.kpis WHERE id = v_cur.kpi_id;
        IF FOUND THEN
          v_score := public.fn_compute_rating_from_achievement(
            v_kpi, v_cur.achieved_value, NULL
          );
          IF v_score IS NOT NULL THEN
            v_inherited_from := 'computed_from_achievement';
          END IF;
        END IF;
      END IF;

      IF v_score IS NULL THEN
        v_reason := 'no_prior_score';
      END IF;
    END IF;

    IF v_reason IS NOT NULL THEN
      v_skipped := v_skipped || jsonb_build_object(
        'submission_id', v_sub_id, 'reason', v_reason);
      CONTINUE;
    END IF;

    v_effective_remarks := COALESCE(NULLIF(btrim(v_cell_remarks), ''), v_shared_remark);

    IF p_stage = 'auditor' AND v_cur.hr_pms_score IS NOT NULL THEN
      v_hr_override_count := v_hr_override_count + 1;
    END IF;

    IF p_stage = 'manager' THEN
      UPDATE public.review_submissions
         SET manager_score = v_score,
             manager_remarks = v_effective_remarks,
             manager_evidence_urls =
               CASE WHEN v_attach_count > 0
                    THEN COALESCE(v_cur.manager_evidence_urls, '[]'::jsonb) || v_attach
                    ELSE manager_evidence_urls END,
             group_write_batch_id = v_batch_id,
             row_version = row_version + 1,
             updated_at = now()
       WHERE id = v_sub_id;
    ELSIF p_stage = 'skip_level' THEN
      UPDATE public.review_submissions
         SET skip_level_score = v_score,
             skip_level_remarks = v_effective_remarks,
             skip_level_evidence_urls =
               CASE WHEN v_attach_count > 0
                    THEN COALESCE(v_cur.skip_level_evidence_urls, '[]'::jsonb) || v_attach
                    ELSE skip_level_evidence_urls END,
             group_write_batch_id = v_batch_id,
             row_version = row_version + 1,
             updated_at = now()
       WHERE id = v_sub_id;
    ELSIF p_stage = 'hr_pms' THEN
      UPDATE public.review_submissions
         SET hr_pms_score = v_score,
             hr_pms_remarks = v_effective_remarks,
             hr_pms_evidence_urls =
               CASE WHEN v_attach_count > 0
                    THEN COALESCE(v_cur.hr_pms_evidence_urls, '[]'::jsonb) || v_attach
                    ELSE hr_pms_evidence_urls END,
             group_write_batch_id = v_batch_id,
             row_version = row_version + 1,
             updated_at = now()
       WHERE id = v_sub_id;
    ELSIF p_stage = 'auditor' THEN
      UPDATE public.review_submissions
         SET auditor_score = v_score,
             auditor_remarks = v_effective_remarks,
             auditor_evidence_urls =
               CASE WHEN v_attach_count > 0
                    THEN COALESCE(v_cur.auditor_evidence_urls, '[]'::jsonb) || v_attach
                    ELSE auditor_evidence_urls END,
             group_write_batch_id = v_batch_id,
             is_auditor_override_of_hr = (v_cur.hr_pms_score IS NOT NULL),
             row_version = row_version + 1,
             updated_at = now()
       WHERE id = v_sub_id;
    END IF;

    BEGIN
      INSERT INTO public.kpi_audit_logs(
        kpi_id, action, performed_by, new_value, metadata
      ) VALUES (
        v_cur.kpi_id,
        'BULK_STAGE_SIGNOFF_' || upper(p_stage),
        v_actor,
        jsonb_build_object(
          'stage', p_stage,
          'score', v_score,
          'inherited_from', v_inherited_from,
          'remarks', v_effective_remarks
        ),
        jsonb_build_object(
          'batch_id', v_batch_id,
          'submission_id', v_sub_id,
          'attachment_count', v_attach_count,
          'batch_reason', v_shared_remark
        )
      );
    EXCEPTION WHEN OTHERS THEN NULL;
    END;

    v_affected_kpi_ids := v_affected_kpi_ids || v_cur.kpi_id;
    v_applied := v_applied + 1;
  END LOOP;

  IF array_length(v_affected_kpi_ids, 1) > 0 THEN
    BEGIN
      v_reconcile_result := public.reconcile_workflow_statuses(
        p_review_period := NULL,
        p_review_year   := NULL,
        p_dry_run       := false,
        p_performed_by  := v_actor,
        p_kpi_ids       := v_affected_kpi_ids
      );
      v_advanced_count := COALESCE((v_reconcile_result->>'count')::int, 0);
    EXCEPTION WHEN OTHERS THEN
      v_advanced_count := -1;
    END;
  END IF;

  INSERT INTO public.bulk_review_batches(
    id, performed_by, stage, scope_filters, affected_count, skipped, batch_reason
  ) VALUES (
    v_batch_id, v_actor, p_stage,
    jsonb_build_object(
      'affected_kpi_ids', to_jsonb(v_affected_kpi_ids),
      'reconcile_advanced_count', v_advanced_count,
      'attachment_count', v_attach_count,
      'attachment_urls', v_attach
    ),
    v_applied, v_skipped, p_batch_reason
  );

  IF p_stage = 'auditor' AND v_hr_override_count > 0 THEN
    BEGIN
      SELECT k.review_period, k.review_year
        INTO v_period, v_year
        FROM public.review_submissions rs
        JOIN public.kpis k ON k.id = rs.kpi_id
       WHERE rs.group_write_batch_id = v_batch_id
       LIMIT 1;

      INSERT INTO public.notifications (user_id, type, title, message, metadata)
      SELECT DISTINCT ur.user_id,
             'auditor_override_of_hr',
             'Auditor overrode HR PMS scores',
             format('Auditor updated %s HR PMS-scored cell(s) in %s %s. Tap to review.',
                    v_hr_override_count,
                    COALESCE(v_period,''), COALESCE(v_year::text,'')),
             jsonb_build_object(
               'batch_id', v_batch_id,
               'affected_count', v_hr_override_count,
               'period', v_period,
               'year', v_year,
               'deep_link', '/review/bulk-scoring?batch=' || v_batch_id::text
             )
        FROM public.user_roles ur
        JOIN public.profiles p ON p.id = ur.user_id
       WHERE ur.role = 'hr_pms'
         AND COALESCE(p.is_active, true) = true;
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END IF;

  RETURN jsonb_build_object(
    'batch_id', v_batch_id,
    'applied', v_applied,
    'advanced', v_advanced_count,
    'skipped', v_skipped,
    'hr_override_count', v_hr_override_count,
    'attachment_count', v_attach_count
  );
END;
$function$;