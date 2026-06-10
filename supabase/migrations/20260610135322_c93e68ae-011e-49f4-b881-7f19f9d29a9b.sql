
ALTER TABLE public.review_submissions DISABLE TRIGGER USER;

DO $$
DECLARE
  v_terminal_kpi_id UUID := '54d7a8c9-74a6-475a-aeca-a748ae61e10a';
  v_sibling_ids UUID[] := ARRAY[
    '510b7762-0d96-4175-8ece-ea0799edca87'::uuid,
    '37622594-df6f-432c-81e6-cd36ac754927'::uuid,
    '21643abb-ebdf-4143-8fd4-a3db3f1ab1d6'::uuid,
    '1f374797-4b32-4138-9def-37f266f2ca9d'::uuid
  ];
  v_term review_submissions%ROWTYPE;
  v_sibling_id UUID;
  v_sibling_kpi RECORD;
BEGIN
  SELECT * INTO v_term FROM review_submissions WHERE kpi_id = v_terminal_kpi_id;
  IF v_term.kpi_id IS NULL THEN
    RAISE EXCEPTION 'Terminal submission missing for kpi_id %', v_terminal_kpi_id;
  END IF;

  FOREACH v_sibling_id IN ARRAY v_sibling_ids LOOP
    SELECT id, review_period, review_year INTO v_sibling_kpi FROM kpis WHERE id = v_sibling_id;

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
      v_sibling_id,
      v_term.self_score, v_term.self_rating, v_term.manager_score, v_term.manager_rating,
      v_term.skip_level_score, v_term.skip_level_rating, v_term.hr_pms_score, v_term.hr_pms_rating,
      v_term.auditor_score, v_term.auditor_rating, v_term.management_score, v_term.management_rating,
      v_term.final_score, v_term.final_rating, v_term.achieved_value, v_term.is_na, now(),
      v_term.self_remarks, v_term.manager_remarks, v_term.skip_level_remarks,
      v_term.hr_pms_remarks, v_term.auditor_remarks, v_term.management_remarks,
      'BACKFILL v2 — re-percolated from terminal April 2026 (ADR-086)',
      v_term.self_evidence_urls, v_term.manager_evidence_urls, v_term.skip_level_evidence_urls,
      v_term.hr_pms_evidence_urls, v_term.auditor_evidence_urls, v_term.management_evidence_urls,
      v_term.manager_achieved_value, v_term.auditor_achieved_value, v_term.management_achieved_value,
      v_term.skip_level_achieved_value, v_term.hr_pms_achieved_value
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

    UPDATE kpis SET status = 'approved' WHERE id = v_sibling_id AND status <> 'approved';

    INSERT INTO kpi_audit_logs (kpi_id, action, performed_by, old_value, new_value, metadata)
    VALUES (
      v_sibling_id, 'SCORE_REPERCOLATED', NULL,
      jsonb_build_object('source_kpi_id', v_terminal_kpi_id),
      jsonb_build_object(
        'final_score', v_term.final_score,
        'final_rating', v_term.final_rating,
        'management_score', v_term.management_score,
        'is_na', v_term.is_na
      ),
      jsonb_build_object(
        'source_kpi_id', v_terminal_kpi_id,
        'source_period', 'April',
        'source_year', 2026,
        'sibling_period', v_sibling_kpi.review_period,
        'sibling_year', v_sibling_kpi.review_year,
        'frequency', 'Half-Yearly',
        'tool', 'BACKFILL_MULTIMONTH_PERCOLATION_v2',
        'policy', 'POLICY_54_v5'
      )
    );
  END LOOP;
END $$;

ALTER TABLE public.review_submissions ENABLE TRIGGER USER;
