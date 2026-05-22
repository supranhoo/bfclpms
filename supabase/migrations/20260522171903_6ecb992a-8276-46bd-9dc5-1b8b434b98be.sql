
-- =====================================================================
-- Bulk Review Dashboard — M4 + M5 write RPCs
-- Strictly additive. All gated by feature_bulk_review_dashboard flag.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. bulk_write_stage_scores
-- p_cells :: jsonb array of { submission_id, score, remarks?, expected_row_version? }
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.bulk_write_stage_scores(
  p_stage text,
  p_cells jsonb,
  p_batch_reason text DEFAULT NULL
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
  v_remarks text;
  v_exp_ver int;
  v_cur record;
  v_applied int := 0;
  v_skipped jsonb := '[]'::jsonb;
  v_reason text;
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

  FOR v_cell IN SELECT * FROM jsonb_array_elements(p_cells)
  LOOP
    v_sub_id := (v_cell->>'submission_id')::uuid;
    v_score  := NULLIF(v_cell->>'score','')::numeric;
    v_remarks:= v_cell->>'remarks';
    v_exp_ver:= NULLIF(v_cell->>'expected_row_version','')::int;
    v_reason := NULL;

    SELECT id, final_score, auditor_score, self_score, row_version
      INTO v_cur
      FROM public.review_submissions
     WHERE id = v_sub_id
     FOR UPDATE;

    IF NOT FOUND THEN
      v_reason := 'not_found';
    ELSIF v_cur.final_score IS NOT NULL THEN
      v_reason := 'final_locked'; -- POLICY §88
    ELSIF v_cur.self_score IS NULL THEN
      v_reason := 'self_not_submitted';
    ELSIF p_stage = 'hr_pms' AND v_cur.auditor_score IS NOT NULL THEN
      v_reason := 'auditor_takes_precedence';
    ELSIF v_exp_ver IS NOT NULL AND v_cur.row_version <> v_exp_ver THEN
      v_reason := 'row_version_conflict';
    END IF;

    IF v_reason IS NOT NULL THEN
      v_skipped := v_skipped || jsonb_build_object(
        'submission_id', v_sub_id, 'reason', v_reason);
      CONTINUE;
    END IF;

    -- Apply per-stage column write
    IF p_stage = 'manager' THEN
      UPDATE public.review_submissions
         SET manager_score = v_score,
             manager_remarks = COALESCE(v_remarks, manager_remarks),
             group_write_batch_id = v_batch_id,
             row_version = row_version + 1,
             updated_at = now()
       WHERE id = v_sub_id;
    ELSIF p_stage = 'skip_level' THEN
      UPDATE public.review_submissions
         SET skip_level_score = v_score,
             skip_level_remarks = COALESCE(v_remarks, skip_level_remarks),
             group_write_batch_id = v_batch_id,
             row_version = row_version + 1,
             updated_at = now()
       WHERE id = v_sub_id;
    ELSIF p_stage = 'hr_pms' THEN
      UPDATE public.review_submissions
         SET hr_pms_score = v_score,
             hr_pms_remarks = COALESCE(v_remarks, hr_pms_remarks),
             group_write_batch_id = v_batch_id,
             row_version = row_version + 1,
             updated_at = now()
       WHERE id = v_sub_id;
    ELSIF p_stage = 'auditor' THEN
      UPDATE public.review_submissions
         SET auditor_score = v_score,
             auditor_remarks = COALESCE(v_remarks, auditor_remarks),
             group_write_batch_id = v_batch_id,
             is_auditor_override_of_hr = (v_cur.id IS NOT NULL),
             row_version = row_version + 1,
             updated_at = now()
       WHERE id = v_sub_id;
    END IF;

    v_applied := v_applied + 1;
  END LOOP;

  INSERT INTO public.bulk_review_batches(
    id, performed_by, stage, scope_filters, affected_count, skipped, batch_reason
  ) VALUES (
    v_batch_id, v_actor, p_stage, '{}'::jsonb, v_applied, v_skipped, p_batch_reason
  );

  RETURN jsonb_build_object(
    'batch_id', v_batch_id,
    'applied', v_applied,
    'skipped', v_skipped
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.bulk_write_stage_scores(text,jsonb,text) TO authenticated;

-- ---------------------------------------------------------------------
-- 2. bulk_management_approve
-- p_cells :: jsonb array of { submission_id, expected_row_version? }
-- Stamps final_score from highest-priority completed stage:
--   auditor > hr_pms > skip_level > manager
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.bulk_management_approve(
  p_cells jsonb,
  p_batch_reason text DEFAULT NULL
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
  v_exp_ver int;
  v_cur record;
  v_final numeric;
  v_source text;
  v_skipped_stages jsonb;
  v_applied int := 0;
  v_skipped jsonb := '[]'::jsonb;
  v_reason text;
BEGIN
  IF NOT public.is_bulk_review_enabled() THEN
    RAISE EXCEPTION 'feature disabled' USING ERRCODE = 'P0001';
  END IF;

  IF jsonb_typeof(p_cells) <> 'array' THEN
    RAISE EXCEPTION 'p_cells must be a json array';
  END IF;

  FOR v_cell IN SELECT * FROM jsonb_array_elements(p_cells)
  LOOP
    v_sub_id := (v_cell->>'submission_id')::uuid;
    v_exp_ver:= NULLIF(v_cell->>'expected_row_version','')::int;
    v_reason := NULL;
    v_final := NULL;
    v_source := NULL;

    SELECT id, final_score, auditor_score, hr_pms_score,
           skip_level_score, manager_score, self_score, row_version
      INTO v_cur
      FROM public.review_submissions
     WHERE id = v_sub_id
     FOR UPDATE;

    IF NOT FOUND THEN
      v_reason := 'not_found';
    ELSIF v_cur.final_score IS NOT NULL THEN
      v_reason := 'already_final';
    ELSIF v_exp_ver IS NOT NULL AND v_cur.row_version <> v_exp_ver THEN
      v_reason := 'row_version_conflict';
    END IF;

    IF v_reason IS NOT NULL THEN
      v_skipped := v_skipped || jsonb_build_object(
        'submission_id', v_sub_id, 'reason', v_reason);
      CONTINUE;
    END IF;

    -- Highest-priority completed stage
    IF v_cur.auditor_score IS NOT NULL THEN
      v_final := v_cur.auditor_score; v_source := 'auditor';
    ELSIF v_cur.hr_pms_score IS NOT NULL THEN
      v_final := v_cur.hr_pms_score; v_source := 'hr_pms';
    ELSIF v_cur.skip_level_score IS NOT NULL THEN
      v_final := v_cur.skip_level_score; v_source := 'skip_level';
    ELSIF v_cur.manager_score IS NOT NULL THEN
      v_final := v_cur.manager_score; v_source := 'manager';
    ELSE
      v_skipped := v_skipped || jsonb_build_object(
        'submission_id', v_sub_id, 'reason', 'no_completed_stage');
      CONTINUE;
    END IF;

    -- Record which stages were skipped (had no score)
    v_skipped_stages := jsonb_build_object(
      'manager_missing',    v_cur.manager_score IS NULL,
      'skip_level_missing', v_cur.skip_level_score IS NULL,
      'hr_pms_missing',     v_cur.hr_pms_score IS NULL,
      'auditor_missing',    v_cur.auditor_score IS NULL,
      'source_stage',       v_source
    );

    UPDATE public.review_submissions
       SET final_score = v_final,
           management_score = COALESCE(management_score, v_final),
           skipped_by_management = v_skipped_stages,
           group_write_batch_id = v_batch_id,
           row_version = row_version + 1,
           updated_at = now()
     WHERE id = v_sub_id;

    v_applied := v_applied + 1;
  END LOOP;

  INSERT INTO public.bulk_review_batches(
    id, performed_by, stage, scope_filters, affected_count, skipped, batch_reason
  ) VALUES (
    v_batch_id, v_actor, 'management_approve', '{}'::jsonb, v_applied, v_skipped, p_batch_reason
  );

  RETURN jsonb_build_object(
    'batch_id', v_batch_id,
    'applied', v_applied,
    'skipped', v_skipped
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.bulk_management_approve(jsonb,text) TO authenticated;

-- ---------------------------------------------------------------------
-- 3. bulk_reopen_cells (M5)
-- p_cells :: jsonb array of { submission_id }
-- p_stages_to_unlock :: text[] subset of {manager, skip_level, hr_pms, auditor}
-- Admin always; Management only if mgmt_can_reopen flag is true.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.bulk_reopen_cells(
  p_cells jsonb,
  p_stages_to_unlock text[],
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_is_admin boolean;
  v_is_mgmt boolean;
  v_mgmt_allowed boolean;
  v_batch_id uuid := gen_random_uuid();
  v_cell jsonb;
  v_sub_id uuid;
  v_cur record;
  v_applied int := 0;
  v_skipped jsonb := '[]'::jsonb;
  v_stage text;
BEGIN
  IF NOT public.is_bulk_review_enabled() THEN
    RAISE EXCEPTION 'feature disabled' USING ERRCODE = 'P0001';
  END IF;

  IF p_reason IS NULL OR length(trim(p_reason)) < 8 THEN
    RAISE EXCEPTION 'reason required (min 8 chars)';
  END IF;

  v_is_admin := public.has_role(v_actor, 'admin');
  v_is_mgmt  := public.has_role(v_actor, 'management');
  v_mgmt_allowed := public.is_mgmt_reopen_enabled();

  IF NOT v_is_admin AND NOT (v_is_mgmt AND v_mgmt_allowed) THEN
    RAISE EXCEPTION 'not authorized to re-open approved cells';
  END IF;

  IF p_stages_to_unlock IS NULL OR array_length(p_stages_to_unlock,1) IS NULL THEN
    RAISE EXCEPTION 'p_stages_to_unlock must list at least one stage';
  END IF;

  FOREACH v_stage IN ARRAY p_stages_to_unlock LOOP
    IF v_stage NOT IN ('manager','skip_level','hr_pms','auditor') THEN
      RAISE EXCEPTION 'invalid stage in unlock list: %', v_stage;
    END IF;
  END LOOP;

  FOR v_cell IN SELECT * FROM jsonb_array_elements(p_cells)
  LOOP
    v_sub_id := (v_cell->>'submission_id')::uuid;

    SELECT id, final_score, final_revision_no, row_version
      INTO v_cur
      FROM public.review_submissions
     WHERE id = v_sub_id
     FOR UPDATE;

    IF NOT FOUND THEN
      v_skipped := v_skipped || jsonb_build_object(
        'submission_id', v_sub_id, 'reason','not_found');
      CONTINUE;
    END IF;
    IF v_cur.final_score IS NULL THEN
      v_skipped := v_skipped || jsonb_build_object(
        'submission_id', v_sub_id, 'reason','not_approved');
      CONTINUE;
    END IF;

    -- Record revision
    INSERT INTO public.final_score_revisions(
      submission_id, revision_no, prev_final_score, new_final_score,
      reason, reopened_stages, performed_by, batch_id, auto_reverted
    ) VALUES (
      v_sub_id,
      COALESCE(v_cur.final_revision_no,0) + 1,
      v_cur.final_score,
      NULL,
      p_reason,
      p_stages_to_unlock,
      v_actor,
      v_batch_id,
      false
    );

    UPDATE public.review_submissions
       SET final_score = NULL,
           management_score = CASE
             WHEN 'auditor' = ANY(p_stages_to_unlock) OR
                  'hr_pms'  = ANY(p_stages_to_unlock) OR
                  'skip_level' = ANY(p_stages_to_unlock) OR
                  'manager' = ANY(p_stages_to_unlock)
               THEN NULL ELSE management_score END,
           manager_score = CASE WHEN 'manager' = ANY(p_stages_to_unlock) THEN NULL ELSE manager_score END,
           skip_level_score = CASE WHEN 'skip_level' = ANY(p_stages_to_unlock) THEN NULL ELSE skip_level_score END,
           hr_pms_score = CASE WHEN 'hr_pms' = ANY(p_stages_to_unlock) THEN NULL ELSE hr_pms_score END,
           auditor_score = CASE WHEN 'auditor' = ANY(p_stages_to_unlock) THEN NULL ELSE auditor_score END,
           final_revision_no = COALESCE(final_revision_no,0) + 1,
           group_write_batch_id = v_batch_id,
           row_version = row_version + 1,
           updated_at = now()
     WHERE id = v_sub_id;

    v_applied := v_applied + 1;
  END LOOP;

  INSERT INTO public.bulk_review_batches(
    id, performed_by, stage, scope_filters, affected_count, skipped, batch_reason
  ) VALUES (
    v_batch_id, v_actor, 'reopen', '{}'::jsonb, v_applied, v_skipped, p_reason
  );

  RETURN jsonb_build_object(
    'batch_id', v_batch_id,
    'applied', v_applied,
    'skipped', v_skipped
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.bulk_reopen_cells(jsonb,text[],text) TO authenticated;
