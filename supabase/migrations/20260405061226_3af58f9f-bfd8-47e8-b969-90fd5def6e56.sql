
DO $$
DECLARE
  v_kpi RECORD;
  v_old_status TEXT;
  v_performer UUID;
BEGIN
  SELECT ur.user_id INTO v_performer FROM user_roles ur WHERE ur.role = 'admin' LIMIT 1;

  FOR v_kpi IN
    SELECT DISTINCT ON (al.kpi_id)
      al.kpi_id,
      al.old_value->>'status' as pre_percolation_status,
      k.status::text as current_status
    FROM kpi_audit_logs al
    JOIN kpis k ON k.id = al.kpi_id
    WHERE al.action = 'SCORE_PERCOLATED'
      AND k.status = 'approved'
      AND k.review_year = 2026
    ORDER BY al.kpi_id, al.created_at DESC
  LOOP
    v_old_status := COALESCE(v_kpi.pre_percolation_status, 'kra_set');

    UPDATE kpis SET status = v_old_status::review_status WHERE id = v_kpi.kpi_id;

    UPDATE review_submissions SET
      self_score = NULL, self_rating = NULL, self_remarks = NULL, self_evidence_urls = NULL,
      manager_score = NULL, manager_rating = NULL, manager_remarks = NULL, manager_evidence_urls = NULL,
      manager_achieved_value = NULL,
      skip_level_score = NULL, skip_level_rating = NULL, skip_level_remarks = NULL, skip_level_evidence_urls = NULL,
      skip_level_achieved_value = NULL,
      hr_pms_score = NULL, hr_pms_rating = NULL, hr_pms_remarks = NULL, hr_pms_evidence_urls = NULL,
      hr_pms_achieved_value = NULL,
      auditor_score = NULL, auditor_rating = NULL, auditor_remarks = NULL, auditor_evidence_urls = NULL,
      auditor_achieved_value = NULL,
      management_score = NULL, management_rating = NULL, management_remarks = NULL, management_evidence_urls = NULL,
      management_achieved_value = NULL,
      final_score = NULL, final_rating = NULL,
      achieved_value = NULL, is_na = false,
      auto_advance_reason = NULL
    WHERE kpi_id = v_kpi.kpi_id;

    INSERT INTO kpi_audit_logs (kpi_id, action, performed_by, old_value, new_value, metadata)
    VALUES (
      v_kpi.kpi_id,
      'ADMIN_BULK_STEP_BACK',
      v_performer,
      jsonb_build_object('status', 'approved'),
      jsonb_build_object('status', v_old_status),
      jsonb_build_object(
        'reason', 'Reverting system percolation bypass — KPI must complete workflow independently',
        'tool', 'bulk_step_back_percolated_kpis',
        'rca', 'percolate_multimonth_score trigger bypassed workflow stages'
      )
    );
  END LOOP;
END $$;
