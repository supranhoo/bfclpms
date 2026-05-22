
-- Phase 2 polish: HR-PMS override notification batched per batch_id.
-- Signature unchanged. Adds a trailing safe block that:
--  - Counts how many cells in this batch had an existing hr_pms_score
--    when stage = 'auditor'.
--  - If > 0, inserts one notification per active HR PMS user.
-- The notification block is wrapped in a BEGIN ... EXCEPTION guard so a
-- failure here cannot break the score write.

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
  v_hr_override_count int := 0;
  v_period text := NULL;
  v_year  int  := NULL;
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

    SELECT id, final_score, auditor_score, hr_pms_score, self_score, row_version
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

    IF v_reason IS NOT NULL THEN
      v_skipped := v_skipped || jsonb_build_object(
        'submission_id', v_sub_id, 'reason', v_reason);
      CONTINUE;
    END IF;

    -- Track HR-PMS override count for batched notification
    IF p_stage = 'auditor' AND v_cur.hr_pms_score IS NOT NULL THEN
      v_hr_override_count := v_hr_override_count + 1;
    END IF;

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
             is_auditor_override_of_hr = (v_cur.hr_pms_score IS NOT NULL),
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

  -- Batched HR-PMS override notification (one per recipient per batch)
  IF p_stage = 'auditor' AND v_hr_override_count > 0 THEN
    BEGIN
      -- Resolve period/year from any one affected submission for context
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
      -- Never let a notification failure roll back the score writes.
      NULL;
    END;
  END IF;

  RETURN jsonb_build_object(
    'batch_id', v_batch_id,
    'applied', v_applied,
    'skipped', v_skipped,
    'hr_override_count', v_hr_override_count
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.bulk_write_stage_scores(text,jsonb,text) TO authenticated;
