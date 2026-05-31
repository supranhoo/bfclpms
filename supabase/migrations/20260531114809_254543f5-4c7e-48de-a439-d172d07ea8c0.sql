ALTER TABLE public.review_submissions DISABLE TRIGGER check_period_lock_on_submission_update;

DO $$
DECLARE
  r              record;
  v_sub_id       uuid;
  v_ach          numeric;
  v_score        numeric;
  v_stage_col    text;
  v_stage_score  text;
  v_cur          record;
  v_old_val      numeric;
  v_old_score    numeric;
  v_repaired     int := 0;
BEGIN
  FOR r IN
    SELECT DISTINCT ON ((al.metadata->>'submission_id')::uuid)
           al.id, al.kpi_id, al.metadata, al.new_value, al.created_at
      FROM public.kpi_audit_logs al
     WHERE al.action = 'ADMIN_BULK_OVERRIDE_FINAL_RESTAMP'
       AND al.created_at::date = current_date
       AND al.metadata ? 'submission_id'
     ORDER BY (al.metadata->>'submission_id')::uuid, al.created_at DESC
  LOOP
    v_sub_id := (r.metadata->>'submission_id')::uuid;
    v_ach    := NULLIF(r.new_value->>'achieved','')::numeric;
    v_score  := NULLIF(r.new_value->>'final_score','')::numeric;
    IF v_ach IS NULL OR v_score IS NULL THEN CONTINUE; END IF;

    SELECT auditor_score, hr_pms_score, skip_level_score, manager_score,
           manager_achieved_value, skip_level_achieved_value,
           hr_pms_achieved_value, auditor_achieved_value
      INTO v_cur
      FROM public.review_submissions
     WHERE id = v_sub_id;
    IF NOT FOUND THEN CONTINUE; END IF;

    v_stage_col := NULL; v_stage_score := NULL; v_old_val := NULL; v_old_score := NULL;
    IF v_cur.auditor_score IS NOT NULL THEN
      v_stage_col := 'auditor_achieved_value';    v_stage_score := 'auditor_score';
      v_old_val := v_cur.auditor_achieved_value;  v_old_score := v_cur.auditor_score;
    ELSIF v_cur.hr_pms_score IS NOT NULL THEN
      v_stage_col := 'hr_pms_achieved_value';     v_stage_score := 'hr_pms_score';
      v_old_val := v_cur.hr_pms_achieved_value;   v_old_score := v_cur.hr_pms_score;
    ELSIF v_cur.skip_level_score IS NOT NULL THEN
      v_stage_col := 'skip_level_achieved_value'; v_stage_score := 'skip_level_score';
      v_old_val := v_cur.skip_level_achieved_value; v_old_score := v_cur.skip_level_score;
    ELSIF v_cur.manager_score IS NOT NULL THEN
      v_stage_col := 'manager_achieved_value';    v_stage_score := 'manager_score';
      v_old_val := v_cur.manager_achieved_value;  v_old_score := v_cur.manager_score;
    ELSE
      CONTINUE;
    END IF;

    EXECUTE format(
      'UPDATE public.review_submissions
          SET %I = $1, %I = $2, updated_at = now()
        WHERE id = $3',
      v_stage_col, v_stage_score
    ) USING v_ach, v_score, v_sub_id;

    INSERT INTO public.kpi_audit_logs(
      kpi_id, action, performed_by, old_value, new_value, metadata
    ) VALUES (
      r.kpi_id,
      'BULK_OVERRIDE_STAGE_RESTAMPED',
      NULL,
      jsonb_build_object('stage_column', v_stage_col,
                         'stage_value',  v_old_val,
                         'stage_score',  v_old_score),
      jsonb_build_object('stage_value', v_ach,
                         'stage_score', v_score,
                         'stage_column', v_stage_col),
      jsonb_build_object(
        'source',        'repair_actor_stage_mirror_v2',
        'submission_id', v_sub_id,
        'origin_log_id', r.id,
        'policy',        '§88.1 (today-only restamp from FINAL_RESTAMP)'
      )
    );
    v_repaired := v_repaired + 1;
  END LOOP;

  RAISE NOTICE 'BULK_OVERRIDE_STAGE_RESTAMPED applied to % submissions (v2)', v_repaired;
END $$;

ALTER TABLE public.review_submissions ENABLE TRIGGER check_period_lock_on_submission_update;