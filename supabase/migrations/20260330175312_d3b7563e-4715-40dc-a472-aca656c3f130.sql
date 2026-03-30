-- Repair stale final_score on approved KPIs where management_score is the terminal authority
-- Scoped to Jan 2026+ per policy (Dec 2025 and earlier are immutable)
UPDATE review_submissions rs
SET final_score = rs.management_score,
    final_rating = rs.management_rating,
    updated_at = now()
FROM kpis k
WHERE rs.kpi_id = k.id
  AND k.status = 'approved'
  AND k.review_year >= 2026
  AND rs.management_score IS NOT NULL
  AND (rs.final_score IS NULL OR rs.final_score != rs.management_score)