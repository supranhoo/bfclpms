ALTER TABLE public.review_submissions DISABLE TRIGGER check_period_lock_on_submission_update;

DO $$
DECLARE
  r            record;
  v_kpi        public.kpis;
  v_new_score  numeric;
  v_repaired   int := 0;
BEGIN
  FOR r IN
    SELECT DISTINCT ON (rs.id)
           rs.id, rs.kpi_id, rs.achieved_value,
           rs.manager_achieved_value, rs.skip_level_achieved_value,
           rs.hr_pms_achieved_value, rs.auditor_achieved_value,
           rs.management_achieved_value,
           rs.manager_score, rs.skip_level_score,
           rs.hr_pms_score, rs.auditor_score, rs.management_score,
           al.id as audit_id, al.created_at as audit_at
      FROM public.review_submissions rs
      JOIN public.kpi_audit_logs al
        ON al.action IN ('ORG_KPI_VALUE_OVERWRITTEN',
                         'ADMIN_BULK_OVERRIDE_FINAL_STAMP',
                         'ADMIN_BULK_OVERRIDE_FINAL_RESTAMP')
       AND (al.metadata->>'submission_id')::uuid = rs.id
     WHERE al.created_at > '2026-05-29'::timestamptz
       AND rs.achieved_value IS NOT NULL
       AND (
         (rs.manager_score    IS NOT NULL AND rs.manager_achieved_value    IS DISTINCT FROM rs.achieved_value) OR
         (rs.skip_level_score IS NOT NULL AND rs.skip_level_achieved_value IS DISTINCT FROM rs.achieved_value) OR
         (rs.hr_pms_score     IS NOT NULL AND rs.hr_pms_achieved_value     IS DISTINCT FROM rs.achieved_value) OR
         (rs.auditor_score    IS NOT NULL AND rs.auditor_achieved_value    IS DISTINCT FROM rs.achieved_value) OR
         (rs.management_score IS NOT NULL AND rs.management_achieved_value IS DISTINCT FROM rs.achieved_value)
       )
     ORDER BY rs.id, al.created_at DESC
  LOOP
    SELECT * INTO v_kpi FROM public.kpis WHERE id = r.kpi_id;
    IF NOT FOUND THEN CONTINUE; END IF;

    v_new_score := public.fn_compute_rating_from_achievement(v_kpi, r.achieved_value, NULL);
    IF v_new_score IS NULL THEN CONTINUE; END IF;

    INSERT INTO public.kpi_audit_logs(
      kpi_id, action, performed_by, old_value, new_value, metadata
    ) VALUES (
      r.kpi_id,
      'STAGE_VALUES_BACKFILLED',
      NULL,
      jsonb_build_object(
        'manager_achieved_value',    r.manager_achieved_value,
        'skip_level_achieved_value', r.skip_level_achieved_value,
        'hr_pms_achieved_value',     r.hr_pms_achieved_value,
        'auditor_achieved_value',    r.auditor_achieved_value,
        'management_achieved_value', r.management_achieved_value,
        'manager_score',             r.manager_score,
        'skip_level_score',          r.skip_level_score,
        'hr_pms_score',              r.hr_pms_score,
        'auditor_score',             r.auditor_score
      ),
      jsonb_build_object(
        'achieved_value',         r.achieved_value,
        'recomputed_stage_score', v_new_score
      ),
      jsonb_build_object(
        'source',              'one_shot_repair_adr_067_addendum',
        'submission_id',       r.id,
        'triggering_audit_id', r.audit_id,
        'policy',              '§88.1 / ADR-067 addendum'
      )
    );

    UPDATE public.review_submissions
       SET manager_achieved_value    = CASE WHEN manager_score    IS NOT NULL THEN r.achieved_value ELSE manager_achieved_value    END,
           skip_level_achieved_value = CASE WHEN skip_level_score IS NOT NULL THEN r.achieved_value ELSE skip_level_achieved_value END,
           hr_pms_achieved_value     = CASE WHEN hr_pms_score     IS NOT NULL THEN r.achieved_value ELSE hr_pms_achieved_value     END,
           auditor_achieved_value    = CASE WHEN auditor_score    IS NOT NULL THEN r.achieved_value ELSE auditor_achieved_value    END,
           management_achieved_value = CASE WHEN management_score IS NOT NULL THEN r.achieved_value ELSE management_achieved_value END,
           manager_score    = CASE WHEN manager_score    IS NOT NULL THEN v_new_score ELSE manager_score    END,
           skip_level_score = CASE WHEN skip_level_score IS NOT NULL THEN v_new_score ELSE skip_level_score END,
           hr_pms_score     = CASE WHEN hr_pms_score     IS NOT NULL THEN v_new_score ELSE hr_pms_score     END,
           auditor_score    = CASE WHEN auditor_score    IS NOT NULL THEN v_new_score ELSE auditor_score    END,
           updated_at = now()
     WHERE id = r.id;

    v_repaired := v_repaired + 1;
  END LOOP;

  RAISE NOTICE 'Repaired % review_submissions rows (per-stage value backfill)', v_repaired;
END $$;

ALTER TABLE public.review_submissions ENABLE TRIGGER check_period_lock_on_submission_update;