-- One-time fix: Clear stale downstream review data for KPIs currently at kra_set or self_review
-- These KPIs were stepped back by admin but their review_submissions still have leftover ratings
UPDATE review_submissions
SET manager_rating = NULL, manager_score = NULL, manager_remarks = NULL,
    manager_evidence_url = NULL, manager_achieved_value = NULL,
    auditor_rating = NULL, auditor_score = NULL, auditor_remarks = NULL,
    auditor_evidence_url = NULL, auditor_achieved_value = NULL,
    management_rating = NULL, management_score = NULL, management_remarks = NULL,
    management_evidence_url = NULL, management_achieved_value = NULL,
    updated_at = now()
WHERE kpi_id IN (
  SELECT id FROM kpis WHERE status IN ('kra_set', 'self_review')
)
AND (manager_rating IS NOT NULL OR auditor_rating IS NOT NULL OR management_rating IS NOT NULL);