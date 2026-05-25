
CREATE OR REPLACE FUNCTION public.bulk_write_stage_scores(
  p_stage text,
  p_cells jsonb,
  p_batch_reason text DEFAULT NULL::text,
  p_attachment_urls jsonb DEFAULT '[]'::jsonb,
  p_manual_scores jsonb DEFAULT NULL,
  p_achieved_values jsonb DEFAULT NULL,
  p_is_override boolean DEFAULT false
)
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
  v_prev_carried numeric;
  v_cell_remarks text;
  v_effective_remarks text;
  v_exp_ver int;
  v_cur record;
  v_kpi public.kpis;
  v_manual numeric;
  v_achieved_in jsonb;
  v_achieved_num numeric;
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
  v_is_admin boolean;
  v_manual_count int := 0;
  v_achieved_count int := 0;
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

  IF p_manual_scores IS NOT NULL AND jsonb_typeof(p_manual_scores) = 'object' THEN
    SELECT count(*)::int INTO v_manual_count FROM jsonb_object_keys(p_manual_scores);
  END IF;
  IF p_achieved_values IS NOT NULL AND jsonb_typeof(p_achieved_values) = 'object' THEN
    SELECT count(*)::int INTO v_achieved_count FROM jsonb_object_keys(p_achieved_values);
  END IF;

  v_is_admin := public.has_role(v_actor, 'admin'::public.app_role);
  IF p_is_override AND NOT v_is_admin THEN
    p_is_override := false;
  END IF;

  FOR v_cell IN SELECT * FROM jsonb_array_elements(p_cells)
  LOOP
    v_sub_id := (v_cell->>'submission_id')::uuid;
    v_cell_remarks := v_cell->>'remarks';
    v_exp_ver:= NULLIF(v_cell->>'expected_row_version','')::int;
    v_reason := NULL;
    v_inherited_from := NULL;
    v_score := NULL;
    v_prev_carried := NULL;

    v_manual := NULL;
    IF p_manual_scores IS NOT NULL AND p_manual_scores ? v_sub_id::text THEN
      v_manual := NULLIF(p_manual_scores->>v_sub_id::text,'')::numeric;
    END IF;

    v_achieved_in := NULL;
    v_achieved_num := NULL;
    IF p_achieved_values IS NOT NULL AND p_achieved_values ? v_sub_id::text THEN
      v_achieved_in := p_achieved_values->v_sub_id::text;
      BEGIN
        v_achieved_num := NULLIF(regexp_replace(COALESCE(v_achieved_in #>> '{}', ''), '[^0-9.\-]', '', 'g'),'')::numeric;
      EXCEPTION WHEN OTHERS THEN v_achieved_num := NULL; END;
    END IF;

    SELECT id, kpi_id, final_score, auditor_score, hr_pms_score,
           skip_level_score, manager_score, self_score, achieved_value, row_version,
           manager_evidence_urls, skip_level_evidence_urls,
           hr_pms_evidence_urls, auditor_evidence_urls
      INTO v_cur
      FROM public.review_submissions
     WHERE id = v_sub_id
     FOR UPDATE;

    -- Gate matrix:
    --   not_found  / final_locked  -> always blocked (POLICY §88 immutable final).
    --   self_not_submitted / auditor_takes_precedence / row_version_conflict
    --                                -> bypassed when admin Override is ON
    --                                   (single-stage override; admin must supply
    --                                   manual or achieved value per row).
    IF NOT FOUND THEN
      v_reason := 'not_found';
    ELSIF v_cur.final_score IS NOT NULL THEN
      v_reason := 'final_locked';
    ELSIF NOT p_is_override AND v_cur.self_score IS NULL THEN
      v_reason := 'self_not_submitted';
    ELSIF NOT p_is_override AND p_stage = 'hr_pms' AND v_cur.auditor_score IS NOT NULL THEN
      v_reason := 'auditor_takes_precedence';
    ELSIF NOT p_is_override AND v_exp_ver IS NOT NULL AND v_cur.row_version <> v_exp_ver THEN
      v_reason := 'row_version_conflict';
    END IF;

    IF v_reason IS NULL AND v_achieved_num IS NOT NULL THEN
      UPDATE public.review_submissions
         SET achieved_value = v_achieved_num
       WHERE id = v_sub_id;
      v_cur.achieved_value := v_achieved_num;
    END IF;

    IF v_reason IS NULL THEN
      v_prev_carried := CASE p_stage
        WHEN 'manager'    THEN v_cur.self_score
        WHEN 'skip_level' THEN COALESCE(v_cur.manager_score, v_cur.self_score)
        WHEN 'hr_pms'     THEN COALESCE(v_cur.skip_level_score, v_cur.manager_score, v_cur.self_score)
        WHEN 'auditor'    THEN COALESCE(v_cur.hr_pms_score, v_cur.skip_level_score, v_cur.manager_score, v_cur.self_score)
      END;
    END IF;

    IF v_reason IS NULL THEN
      IF v_manual IS NOT NULL THEN
        v_score := GREATEST(0, LEAST(5, v_manual));
        v_inherited_from := CASE WHEN p_is_override THEN 'admin_override' ELSE 'manual' END;
      ELSIF v_achieved_num IS NOT NULL THEN
        SELECT * INTO v_kpi FROM public.kpis WHERE id = v_cur.kpi_id;
        IF FOUND THEN
          v_score := public.fn_compute_rating_from_achievement(v_kpi, v_achieved_num, NULL);
        END IF;
        IF v_score IS NULL THEN
          v_reason := 'no_prior_score';
        ELSE
          v_inherited_from := CASE WHEN p_is_override THEN 'admin_override' ELSE 'computed_from_achievement' END;
        END IF;
      ELSIF p_is_override THEN
        -- Override mode requires explicit input per row (manual OR achieved).
        v_reason := 'override_requires_input';
      ELSE
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
          'remarks', v_effective_remarks,
          'prev_carried', v_prev_carried,
          'achieved_in', v_achieved_in,
          'manual_in', v_manual,
          'is_override', p_is_override
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
      'attachment_urls', v_attach,
      'is_override', p_is_override,
      'manual_count', v_manual_count,
      'achieved_count', v_achieved_count
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
    'attachment_count', v_attach_count,
    'is_override', p_is_override
  );
END;
$function$;
