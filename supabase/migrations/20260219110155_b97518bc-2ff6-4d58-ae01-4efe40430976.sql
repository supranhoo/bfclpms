-- v1.45.25: Backfill final_rating/final_score for approved KPIs where admin submitted
-- management-level data but final fields were never populated.
-- This fixes the scoring engine seeing null final_score for approved KPIs.

-- 1. Backfill from management level (most common admin approval path)
UPDATE review_submissions rs
SET 
  final_rating = rs.management_rating,
  final_score  = rs.management_score,
  updated_at   = now()
FROM kpis k
WHERE rs.kpi_id = k.id
  AND k.status = 'approved'
  AND rs.management_score IS NOT NULL
  AND rs.final_score IS NULL;

-- 2. Backfill from auditor level (for workflows where audit is last before approved)
UPDATE review_submissions rs
SET 
  final_rating = rs.auditor_rating,
  final_score  = rs.auditor_score,
  updated_at   = now()
FROM kpis k
WHERE rs.kpi_id = k.id
  AND k.status = 'approved'
  AND rs.auditor_score IS NOT NULL
  AND rs.management_score IS NULL
  AND rs.final_score IS NULL;

-- 3. Backfill from hr_pms level (for workflows ending at hr_pms)
UPDATE review_submissions rs
SET 
  final_rating = rs.hr_pms_rating,
  final_score  = rs.hr_pms_score,
  updated_at   = now()
FROM kpis k
WHERE rs.kpi_id = k.id
  AND k.status = 'approved'
  AND rs.hr_pms_score IS NOT NULL
  AND rs.management_score IS NULL
  AND rs.auditor_score IS NULL
  AND rs.final_score IS NULL;