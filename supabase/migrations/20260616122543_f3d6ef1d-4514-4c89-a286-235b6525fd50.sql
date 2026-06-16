CREATE OR REPLACE FUNCTION public.bulk_save_stage_drafts(
  p_stage           text,
  p_cells           jsonb,
  p_batch_reason    text   DEFAULT NULL,
  p_attachment_urls jsonb  DEFAULT '[]'::jsonb,
  p_achieved_values jsonb  DEFAULT NULL,
  p_manual_scores   jsonb  DEFAULT NULL,
  p_is_na           jsonb  DEFAULT NULL,
  p_na_reasons      jsonb  DEFAULT NULL
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
  v_exp_ver int;
  v_cur record;
  v_kpi public.kpis;
  v_manual numeric;
  v_achieved_in jsonb;
  v_achieved_num numeric;
  v_score numeric;
  v_new_rating public.rating_level;
  v_is_na_cell boolean;
  v_cell_remark text;
  v_effective_remark text;
  v_shared_remark text;
  v_attach jsonb;
  v_attach_count int;
  v_applied int := 0;
  v_skipped jsonb := '[]'::jsonb;
  v_reason text;
  v_updated_count int;
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
  -- Draft remark is OPTIONAL (mirrors single-row Save Draft).

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
    v_cell_remark := v_cell->>'remarks';
    v_exp_ver := NULLIF(v_cell->>'expected_row_version','')::int;
    v_reason := NULL;
    v_score := NULL;
    v_new_rating := NULL;

    v_is_na_cell := COALESCE(
      (p_is_na IS NOT NULL AND (p_is_na ? v_sub_id::text)
        AND (p_is_na->>v_sub_id::text)::boolean),
      false);

    v_manual := NULL;
    IF p_manual_scores IS NOT NULL AND p_manual_scores ? v_sub_id::text THEN
      v_manual := NULLIF(p_manual_scores->>v_sub_id::text,'')::numeric;
    END IF;

    v_achieved_in := NULL;
    v_achieved_num := NULL;
    IF p_achieved_values IS NOT NULL AND p_achieved_values ? v_sub_id::text THEN
      v_achieved_in := p_achieved_values->v_sub_id::text;
      BEGIN
        v_achieved_num := NULLIF(
          regexp_replace(COALESCE(v_achieved_in #>> '{}', ''), '[^0-9.\-]', '', 'g'),
          '')::numeric;
      EXCEPTION WHEN OTHERS THEN v_achieved_num := NULL; END;
    END IF;

    SELECT id, kpi_id, final_score, row_version,
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
    ELSIF v_exp_ver IS NOT NULL AND v_cur.row_version <> v_exp_ver THEN
      v_reason := 'row_version_conflict';
    END IF;

    IF v_reason IS NULL AND NOT v_is_na_cell THEN
      IF v_manual IS NOT NULL THEN
        v_score := GREATEST(0, LEAST(5, v_manual));
      ELSIF v_achieved_num IS NOT NULL THEN
        SELECT * INTO v_kpi FROM public.kpis WHERE id = v_cur.kpi_id;
        IF FOUND THEN
          v_score := public.fn_compute_rating_from_achievement(v_kpi, v_achieved_num, NULL);
        END IF;
      END IF;

      IF v_score IS NOT NULL THEN
        v_new_rating := CASE
          WHEN v_score >= 4.5 THEN 'blue'::public.rating_level
          WHEN v_score >= 3.5 THEN 'green'::public.rating_level
          WHEN v_score >= 2.5 THEN 'yellow'::public.rating_level
          ELSE 'red'::public.rating_level
        END;
      END IF;
    END IF;

    IF v_reason IS NOT NULL THEN
      v_skipped := v_skipped || jsonb_build_object(
        'submission_id', v_sub_id, 'reason', v_reason);
      CONTINUE;
    END IF;

    v_effective_remark := NULLIF(
      COALESCE(NULLIF(btrim(v_cell_remark), ''), v_shared_remark),
      '');

    v_updated_count := 0;

    IF p_stage = 'manager' THEN
      UPDATE public.review_submissions
         SET manager_achieved_value = CASE
               WHEN v_is_na_cell THEN NULL
               WHEN v_achieved_num IS NOT NULL THEN v_achieved_num
               ELSE manager_achieved_value END,
             manager_score = CASE
               WHEN v_is_na_cell THEN NULL
               WHEN v_score IS NOT NULL THEN v_score
               ELSE manager_score END,
             manager_rating = CASE
               WHEN v_is_na_cell THEN NULL
               WHEN v_new_rating IS NOT NULL THEN v_new_rating
               ELSE manager_rating END,
             manager_remarks = COALESCE(v_effective_remark, manager_remarks),
             manager_evidence_urls = CASE
               WHEN v_attach_count > 0
                 THEN COALESCE(v_cur.manager_evidence_urls, '[]'::jsonb) || v_attach
               ELSE manager_evidence_urls END,
             group_write_batch_id = v_batch_id,
             row_version = row_version + 1,
             updated_at = now()
       WHERE id = v_sub_id;
      GET DIAGNOSTICS v_updated_count = ROW_COUNT;
    ELSIF p_stage = 'skip_level' THEN
      UPDATE public.review_submissions
         SET skip_level_achieved_value = CASE
               WHEN v_is_na_cell THEN NULL
               WHEN v_achieved_num IS NOT NULL THEN v_achieved_num
               ELSE skip_level_achieved_value END,
             skip_level_score = CASE
               WHEN v_is_na_cell THEN NULL
               WHEN v_score IS NOT NULL THEN v_score
               ELSE skip_level_score END,
             skip_level_rating = CASE
               WHEN v_is_na_cell THEN NULL
               WHEN v_new_rating IS NOT NULL THEN v_new_rating
               ELSE skip_level_rating END,
             skip_level_remarks = COALESCE(v_effective_remark, skip_level_remarks),
             skip_level_evidence_urls = CASE
               WHEN v_attach_count > 0
                 THEN COALESCE(v_cur.skip_level_evidence_urls, '[]'::jsonb) || v_attach
               ELSE skip_level_evidence_urls END,
             group_write_batch_id = v_batch_id,
             row_version = row_version + 1,
             updated_at = now()
       WHERE id = v_sub_id;
      GET DIAGNOSTICS v_updated_count = ROW_COUNT;
    ELSIF p_stage = 'hr_pms' THEN
      UPDATE public.review_submissions
         SET hr_pms_achieved_value = CASE
               WHEN v_is_na_cell THEN NULL
               WHEN v_achieved_num IS NOT NULL THEN v_achieved_num
               ELSE hr_pms_achieved_value END,
             hr_pms_score = CASE
               WHEN v_is_na_cell THEN NULL
               WHEN v_score IS NOT NULL THEN v_score
               ELSE hr_pms_score END,
             hr_pms_rating = CASE
               WHEN v_is_na_cell THEN NULL
               WHEN v_new_rating IS NOT NULL THEN v_new_rating
               ELSE hr_pms_rating END,
             hr_pms_remarks = COALESCE(v_effective_remark, hr_pms_remarks),
             hr_pms_evidence_urls = CASE
               WHEN v_attach_count > 0
                 THEN COALESCE(v_cur.hr_pms_evidence_urls, '[]'::jsonb) || v_attach
               ELSE hr_pms_evidence_urls END,
             group_write_batch_id = v_batch_id,
             row_version = row_version + 1,
             updated_at = now()
       WHERE id = v_sub_id;
      GET DIAGNOSTICS v_updated_count = ROW_COUNT;
    ELSIF p_stage = 'auditor' THEN
      UPDATE public.review_submissions
         SET auditor_achieved_value = CASE
               WHEN v_is_na_cell THEN NULL
               WHEN v_achieved_num IS NOT NULL THEN v_achieved_num
               ELSE auditor_achieved_value END,
             auditor_score = CASE
               WHEN v_is_na_cell THEN NULL
               WHEN v_score IS NOT NULL THEN v_score
               ELSE auditor_score END,
             auditor_rating = CASE
               WHEN v_is_na_cell THEN NULL
               WHEN v_new_rating IS NOT NULL THEN v_new_rating
               ELSE auditor_rating END,
             auditor_remarks = COALESCE(v_effective_remark, auditor_remarks),
             auditor_evidence_urls = CASE
               WHEN v_attach_count > 0
                 THEN COALESCE(v_cur.auditor_evidence_urls, '[]'::jsonb) || v_attach
               ELSE auditor_evidence_urls END,
             group_write_batch_id = v_batch_id,
             row_version = row_version + 1,
             updated_at = now()
       WHERE id = v_sub_id;
      GET DIAGNOSTICS v_updated_count = ROW_COUNT;
    END IF;

    IF v_updated_count = 0 THEN
      v_skipped := v_skipped || jsonb_build_object(
        'submission_id', v_sub_id, 'reason', 'permission_denied');
      CONTINUE;
    END IF;

    BEGIN
      INSERT INTO public.kpi_audit_logs(kpi_id, action, performed_by, new_value, metadata)
      VALUES (v_cur.kpi_id, 'BULK_DRAFT_SAVED_' || upper(p_stage), v_actor,
        jsonb_build_object(
          'stage', p_stage,
          'achieved_in', v_achieved_in,
          'manual_in', v_manual,
          'score', v_score,
          'is_na', v_is_na_cell,
          'remarks', v_effective_remark),
        jsonb_build_object(
          'batch_id', v_batch_id,
          'submission_id', v_sub_id,
          'attachment_count', v_attach_count,
          'batch_reason', v_shared_remark,
          'policy', '§111.7.a.8'));
    EXCEPTION WHEN OTHERS THEN NULL;
    END;

    v_applied := v_applied + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'batch_id', v_batch_id,
    'applied',  v_applied,
    'skipped',  v_skipped);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.bulk_save_stage_drafts(text, jsonb, text, jsonb, jsonb, jsonb, jsonb, jsonb)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.bulk_save_stage_drafts(text, jsonb, text, jsonb, jsonb, jsonb, jsonb, jsonb)
  TO service_role;