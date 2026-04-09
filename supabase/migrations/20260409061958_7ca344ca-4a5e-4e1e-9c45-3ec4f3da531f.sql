
-- Restore Bi-Monthly January 2026 KPIs from December 2025 terminal data
-- These were incorrectly reset by the April 5 premature-review migration
-- which didn't distinguish Dec-Jan cycle (complete) from Feb-Mar cycle (premature)

DO $$
DECLARE
  v_jan_kpi RECORD;
  v_dec_kpi_id UUID;
  v_dec_sub RECORD;
  v_restored_count INTEGER := 0;
  v_skipped_count INTEGER := 0;
BEGIN
  FOR v_jan_kpi IN
    SELECT k.id, k.employee_id, k.kra_name, k.kpi_name, k.status::text
    FROM kpis k
    WHERE k.frequency = 'Bi-Monthly'
      AND k.review_period = 'January'
      AND k.review_year = 2026
      AND k.status = 'kra_set'
  LOOP
    -- Find the matching December 2025 terminal KPI
    SELECT k2.id INTO v_dec_kpi_id
    FROM kpis k2
    WHERE k2.employee_id = v_jan_kpi.employee_id
      AND k2.kra_name = v_jan_kpi.kra_name
      AND k2.kpi_name = v_jan_kpi.kpi_name
      AND k2.frequency = 'Bi-Monthly'
      AND k2.review_period = 'December'
      AND k2.review_year = 2025
      AND k2.status = 'approved'
    LIMIT 1;

    IF v_dec_kpi_id IS NULL THEN
      v_skipped_count := v_skipped_count + 1;
      CONTINUE;
    END IF;

    -- Get December submission data
    SELECT * INTO v_dec_sub
    FROM review_submissions
    WHERE kpi_id = v_dec_kpi_id
    ORDER BY submitted_at DESC NULLS LAST
    LIMIT 1;

    IF v_dec_sub IS NULL THEN
      v_skipped_count := v_skipped_count + 1;
      CONTINUE;
    END IF;

    -- Copy submission data from December to January
    INSERT INTO review_submissions (
      kpi_id,
      self_score, self_rating, manager_score, manager_rating,
      skip_level_score, skip_level_rating, hr_pms_score, hr_pms_rating,
      auditor_score, auditor_rating, management_score, management_rating,
      final_score, final_rating, achieved_value, is_na, submitted_at,
      self_remarks, manager_remarks, skip_level_remarks,
      hr_pms_remarks, auditor_remarks, management_remarks,
      auto_advance_reason,
      self_evidence_urls, manager_evidence_urls, skip_level_evidence_urls,
      hr_pms_evidence_urls, auditor_evidence_urls, management_evidence_urls,
      manager_achieved_value, auditor_achieved_value, management_achieved_value,
      skip_level_achieved_value, hr_pms_achieved_value
    ) VALUES (
      v_jan_kpi.id,
      v_dec_sub.self_score, v_dec_sub.self_rating,
      v_dec_sub.manager_score, v_dec_sub.manager_rating,
      v_dec_sub.skip_level_score, v_dec_sub.skip_level_rating,
      v_dec_sub.hr_pms_score, v_dec_sub.hr_pms_rating,
      v_dec_sub.auditor_score, v_dec_sub.auditor_rating,
      v_dec_sub.management_score, v_dec_sub.management_rating,
      v_dec_sub.final_score, v_dec_sub.final_rating,
      v_dec_sub.achieved_value, v_dec_sub.is_na, now(),
      v_dec_sub.self_remarks, v_dec_sub.manager_remarks,
      v_dec_sub.skip_level_remarks,
      v_dec_sub.hr_pms_remarks, v_dec_sub.auditor_remarks,
      v_dec_sub.management_remarks,
      'Restored: re-percolated from Dec 2025 terminal month',
      v_dec_sub.self_evidence_urls, v_dec_sub.manager_evidence_urls,
      v_dec_sub.skip_level_evidence_urls,
      v_dec_sub.hr_pms_evidence_urls, v_dec_sub.auditor_evidence_urls,
      v_dec_sub.management_evidence_urls,
      v_dec_sub.manager_achieved_value, v_dec_sub.auditor_achieved_value,
      v_dec_sub.management_achieved_value,
      v_dec_sub.skip_level_achieved_value, v_dec_sub.hr_pms_achieved_value
    )
    ON CONFLICT (kpi_id) DO UPDATE SET
      self_score = EXCLUDED.self_score, self_rating = EXCLUDED.self_rating,
      manager_score = EXCLUDED.manager_score, manager_rating = EXCLUDED.manager_rating,
      skip_level_score = EXCLUDED.skip_level_score, skip_level_rating = EXCLUDED.skip_level_rating,
      hr_pms_score = EXCLUDED.hr_pms_score, hr_pms_rating = EXCLUDED.hr_pms_rating,
      auditor_score = EXCLUDED.auditor_score, auditor_rating = EXCLUDED.auditor_rating,
      management_score = EXCLUDED.management_score, management_rating = EXCLUDED.management_rating,
      final_score = EXCLUDED.final_score, final_rating = EXCLUDED.final_rating,
      achieved_value = EXCLUDED.achieved_value, is_na = EXCLUDED.is_na,
      submitted_at = EXCLUDED.submitted_at,
      self_remarks = EXCLUDED.self_remarks, manager_remarks = EXCLUDED.manager_remarks,
      skip_level_remarks = EXCLUDED.skip_level_remarks,
      hr_pms_remarks = EXCLUDED.hr_pms_remarks, auditor_remarks = EXCLUDED.auditor_remarks,
      management_remarks = EXCLUDED.management_remarks,
      auto_advance_reason = EXCLUDED.auto_advance_reason,
      self_evidence_urls = EXCLUDED.self_evidence_urls, manager_evidence_urls = EXCLUDED.manager_evidence_urls,
      skip_level_evidence_urls = EXCLUDED.skip_level_evidence_urls,
      hr_pms_evidence_urls = EXCLUDED.hr_pms_evidence_urls, auditor_evidence_urls = EXCLUDED.auditor_evidence_urls,
      management_evidence_urls = EXCLUDED.management_evidence_urls,
      manager_achieved_value = EXCLUDED.manager_achieved_value, auditor_achieved_value = EXCLUDED.auditor_achieved_value,
      management_achieved_value = EXCLUDED.management_achieved_value,
      skip_level_achieved_value = EXCLUDED.skip_level_achieved_value, hr_pms_achieved_value = EXCLUDED.hr_pms_achieved_value;

    -- Set January KPI status to approved
    UPDATE kpis SET status = 'approved' WHERE id = v_jan_kpi.id;

    -- Audit log
    INSERT INTO kpi_audit_logs (kpi_id, action, performed_by, old_value, new_value, metadata)
    VALUES (
      v_jan_kpi.id,
      'ADMIN_BULK_RESTORE',
      NULL,
      jsonb_build_object('status', 'kra_set'),
      jsonb_build_object('status', 'approved', 'final_score', v_dec_sub.final_score),
      jsonb_build_object(
        'source_kpi_id', v_dec_kpi_id,
        'source_period', 'December',
        'source_year', 2025,
        'reason', 'Restored Bi-Monthly Jan 2026 from Dec 2025 terminal — incorrectly reset by Apr 5 migration',
        'tool', 'restore_jan_bimonthly_migration'
      )
    );

    v_restored_count := v_restored_count + 1;
  END LOOP;

  RAISE NOTICE 'Bi-Monthly Jan 2026 restore complete: % restored, % skipped (no matching Dec terminal)', v_restored_count, v_skipped_count;
END;
$$;
