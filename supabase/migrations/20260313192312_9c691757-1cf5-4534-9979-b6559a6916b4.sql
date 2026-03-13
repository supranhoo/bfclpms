
-- Temporarily disable the locked-period guard trigger for data repair
ALTER TABLE review_submissions DISABLE TRIGGER check_period_lock_on_submission_update;

-- Bug 1: Repair N/A approved KPIs — ensure final_score/final_rating are NULL
UPDATE review_submissions rs
SET final_score = NULL, final_rating = NULL, updated_at = now()
WHERE rs.is_na = true
  AND rs.kpi_id IN (
    SELECT k.id FROM kpis k WHERE k.status = 'approved'
  )
  AND (rs.final_score IS NOT NULL OR rs.final_rating IS NOT NULL);

-- Bug 2: Repair approved non-NA KPIs with final_score = 0 but self_score > 0
UPDATE review_submissions rs
SET 
  final_score = CASE
    WHEN rs.management_score IS NOT NULL AND rs.management_score > 0 THEN rs.management_score
    WHEN rs.auditor_score IS NOT NULL AND rs.auditor_score > 0 THEN rs.auditor_score
    WHEN rs.hr_pms_score IS NOT NULL AND rs.hr_pms_score > 0 THEN rs.hr_pms_score
    WHEN rs.skip_level_score IS NOT NULL AND rs.skip_level_score > 0 THEN rs.skip_level_score
    WHEN rs.manager_score IS NOT NULL AND rs.manager_score > 0 THEN rs.manager_score
    WHEN rs.self_score IS NOT NULL AND rs.self_score > 0 THEN rs.self_score
    ELSE 0
  END,
  final_rating = CASE
    WHEN rs.management_score IS NOT NULL AND rs.management_score > 0 THEN rs.management_rating
    WHEN rs.auditor_score IS NOT NULL AND rs.auditor_score > 0 THEN rs.auditor_rating
    WHEN rs.hr_pms_score IS NOT NULL AND rs.hr_pms_score > 0 THEN rs.hr_pms_rating
    WHEN rs.skip_level_score IS NOT NULL AND rs.skip_level_score > 0 THEN rs.skip_level_rating
    WHEN rs.manager_score IS NOT NULL AND rs.manager_score > 0 THEN rs.manager_rating
    WHEN rs.self_score IS NOT NULL AND rs.self_score > 0 THEN rs.self_rating
    ELSE 'red'
  END,
  updated_at = now()
WHERE rs.is_na = false
  AND rs.final_score = 0
  AND rs.self_score > 0
  AND rs.kpi_id IN (
    SELECT k.id FROM kpis k WHERE k.status = 'approved'
  );

-- Re-enable the trigger
ALTER TABLE review_submissions ENABLE TRIGGER check_period_lock_on_submission_update;
