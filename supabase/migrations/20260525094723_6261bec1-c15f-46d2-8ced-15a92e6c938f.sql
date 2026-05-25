-- ============================================================================
-- Bulk Approve (Management) v2: remark + shared evidence + guaranteed advance
-- See plan: .lovable/plan.md  |  ADR-064 v1.2 addendum
-- ============================================================================

-- Drop old signature so we can change the parameter list cleanly.
DROP FUNCTION IF EXISTS public.bulk_management_approve(jsonb, text);

CREATE OR REPLACE FUNCTION public.bulk_management_approve(
  p_cells            jsonb,
  p_batch_reason     text     DEFAULT NULL,
  p_attachment_urls  jsonb    DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor          uuid := auth.uid();
  v_batch_id       uuid := gen_random_uuid();
  v_cell           jsonb;
  v_sub_id         uuid;
  v_exp_ver        int;
  v_cur            record;
  v_final          numeric;
  v_source         text;
  v_skipped_stages jsonb;
  v_applied        int := 0;
  v_advanced       int := 0;
  v_skipped        jsonb := '[]'::jsonb;
  v_reason         text;
  v_remark         text;
  v_attach         jsonb;
  v_merged_attach  jsonb;
  v_kpi_id         uuid;
  v_drift          jsonb := '[]'::jsonb;
BEGIN
  IF NOT public.is_bulk_review_enabled() THEN
    RAISE EXCEPTION 'feature disabled' USING ERRCODE = 'P0001';
  END IF;

  IF jsonb_typeof(p_cells) <> 'array' THEN
    RAISE EXCEPTION 'p_cells must be a json array';
  END IF;

  -- Remark is now MANDATORY (>=10 chars after trim).
  IF p_batch_reason IS NULL OR length(btrim(p_batch_reason)) < 10 THEN
    RAISE EXCEPTION 'remark required (min 10 characters)' USING ERRCODE = '22023';
  END IF;

  IF jsonb_typeof(COALESCE(p_attachment_urls, '[]'::jsonb)) <> 'array' THEN
    RAISE EXCEPTION 'p_attachment_urls must be a json array of urls';
  END IF;

  -- Hard cap on shared attachments (matches client UX guard).
  IF jsonb_array_length(COALESCE(p_attachment_urls, '[]'::jsonb)) > 5 THEN
    RAISE EXCEPTION 'too many attachments (max 5)';
  END IF;

  v_attach := COALESCE(p_attachment_urls, '[]'::jsonb);

  FOR v_cell IN SELECT * FROM jsonb_array_elements(p_cells)
  LOOP
    v_sub_id := (v_cell->>'submission_id')::uuid;
    v_exp_ver:= NULLIF(v_cell->>'expected_row_version','')::int;
    v_reason := NULL;
    v_final  := NULL;
    v_source := NULL;

    SELECT id, kpi_id, final_score, auditor_score, hr_pms_score,
           skip_level_score, manager_score, self_score, row_version,
           management_evidence_urls, management_remarks, kpi_status
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

    -- Highest-priority completed stage (POLICY §88).
    IF v_cur.auditor_score IS NOT NULL THEN
      v_final := v_cur.auditor_score;     v_source := 'auditor';
    ELSIF v_cur.hr_pms_score IS NOT NULL THEN
      v_final := v_cur.hr_pms_score;      v_source := 'hr_pms';
    ELSIF v_cur.skip_level_score IS NOT NULL THEN
      v_final := v_cur.skip_level_score;  v_source := 'skip_level';
    ELSIF v_cur.manager_score IS NOT NULL THEN
      v_final := v_cur.manager_score;     v_source := 'manager';
    ELSE
      v_skipped := v_skipped || jsonb_build_object(
        'submission_id', v_sub_id, 'reason', 'no_completed_stage');
      CONTINUE;
    END IF;

    v_skipped_stages := jsonb_build_object(
      'manager_missing',    v_cur.manager_score    IS NULL,
      'skip_level_missing', v_cur.skip_level_score IS NULL,
      'hr_pms_missing',     v_cur.hr_pms_score     IS NULL,
      'auditor_missing',    v_cur.auditor_score    IS NULL,
      'source_stage',       v_source
    );

    -- Merge shared attachments into existing management_evidence_urls (cap 10).
    v_merged_attach := COALESCE(v_cur.management_evidence_urls, '[]'::jsonb) || v_attach;
    IF jsonb_array_length(v_merged_attach) > 10 THEN
      v_merged_attach := (
        SELECT jsonb_agg(value)
          FROM (
            SELECT value FROM jsonb_array_elements(v_merged_attach)
             OFFSET GREATEST(jsonb_array_length(v_merged_attach) - 10, 0)
          ) t
      );
    END IF;

    -- Stamp final_score + management score + remark + evidence + terminal kpi_status.
    -- (Atomic with the score stamp — no half-applied rows.)
    v_remark := btrim(p_batch_reason);
    v_kpi_id := v_cur.kpi_id;

    UPDATE public.review_submissions
       SET final_score              = v_final,
           management_score         = COALESCE(management_score, v_final),
           management_remarks       = CASE
             WHEN management_remarks IS NULL OR length(btrim(management_remarks)) = 0
               THEN v_remark
             ELSE management_remarks || E'\n\n[Bulk approval] ' || v_remark
           END,
           management_evidence_urls = v_merged_attach,
           skipped_by_management    = v_skipped_stages,
           group_write_batch_id     = v_batch_id,
           kpi_status               = 'approved'::kpi_status,
           row_version              = row_version + 1,
           updated_at               = now()
     WHERE id = v_sub_id;

    v_applied := v_applied + 1;

    -- Advance the parent KPI to terminal 'approved' (anti-stuck guarantee).
    UPDATE public.kpis
       SET status = 'approved'::workflow_stage,
           updated_at = now()
     WHERE id = v_kpi_id
       AND status <> 'approved'::workflow_stage;

    v_advanced := v_advanced + 1;
  END LOOP;

  -- Post-commit reconcile guard: confirm every cell we stamped really is terminal.
  -- (Within the same tx — if a trigger reverted any row, drift is recorded.)
  SELECT COALESCE(jsonb_agg(rs.id), '[]'::jsonb)
    INTO v_drift
    FROM public.review_submissions rs
    JOIN public.kpis k ON k.id = rs.kpi_id
   WHERE rs.group_write_batch_id = v_batch_id
     AND (rs.kpi_status <> 'approved'::kpi_status
          OR k.status   <> 'approved'::workflow_stage);

  INSERT INTO public.bulk_review_batches(
    id, performed_by, stage, scope_filters, affected_count, skipped, batch_reason
  ) VALUES (
    v_batch_id,
    v_actor,
    'management_approve',
    jsonb_build_object(
      'attachment_count', jsonb_array_length(v_attach),
      'attachment_urls',  v_attach,
      'drift_ids',        v_drift,
      'advanced_count',   v_advanced
    ),
    v_applied,
    v_skipped,
    p_batch_reason
  );

  -- If drift detected, surface as hard error so client shows escalation toast.
  IF jsonb_array_length(v_drift) > 0 THEN
    RAISE EXCEPTION 'bulk_advance_drift: % cells stamped but not advanced (batch=%)',
      jsonb_array_length(v_drift), v_batch_id
      USING ERRCODE = 'P0001';
  END IF;

  RETURN jsonb_build_object(
    'batch_id', v_batch_id,
    'applied',  v_applied,
    'advanced', v_advanced,
    'skipped',  v_skipped
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.bulk_management_approve(jsonb, text, jsonb) TO authenticated;
