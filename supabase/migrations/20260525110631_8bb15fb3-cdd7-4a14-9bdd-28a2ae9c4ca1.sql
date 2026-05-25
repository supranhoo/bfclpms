-- Bulk stage sign-off v2: persist shared remark and shared evidence onto the acted stage.
-- Backward-compatible: adds p_attachment_urls (defaults to '[]').
-- See .lovable/plan.md and POLICY.md §111.7.a.

DROP FUNCTION IF EXISTS public.bulk_write_stage_scores(text, jsonb, text);

CREATE OR REPLACE FUNCTION public.bulk_write_stage_scores(
  p_stage           text,
  p_cells           jsonb,
  p_batch_reason    text  DEFAULT NULL,
  p_attachment_urls jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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

  -- Shared remark is mandatory for stage sign-off (matches BulkApproveDialog UX).
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
           skip_level_score, manager_score, self_score, row_version,
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

      IF v_score IS NULL THEN
        v_reason := 'no_prior_score';
      END IF;
    END IF;

    IF v_reason IS NOT NULL THEN
      v_skipped := v_skipped || jsonb_build_object(
        'submission_id', v_sub_id, 'reason', v_reason);
      CONTINUE;
    END IF;

    -- Use per-cell remark if supplied, otherwise the shared batch remark.
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
$$;

GRANT EXECUTE ON FUNCTION public.bulk_write_stage_scores(text, jsonb, text, jsonb) TO authenticated;