
-- Temporarily disable the locked period check trigger for data correction
ALTER TABLE public.review_submissions DISABLE TRIGGER check_period_lock_on_submission_update;

-- Fix 1: Recalculate final_score for approved KPIs where it's stale
UPDATE review_submissions rs
SET 
  final_score = COALESCE(rs.management_score, rs.auditor_score, rs.hr_pms_score, 
                          rs.skip_level_score, rs.manager_score, rs.self_score),
  final_rating = COALESCE(rs.management_rating, rs.auditor_rating, rs.hr_pms_rating,
                           rs.skip_level_rating, rs.manager_rating, rs.self_rating)
FROM kpis k
WHERE k.id = rs.kpi_id
  AND k.status = 'approved'
  AND rs.is_na = false
  AND rs.final_score IS DISTINCT FROM 
      COALESCE(rs.management_score, rs.auditor_score, rs.hr_pms_score,
               rs.skip_level_score, rs.manager_score, rs.self_score);

-- Fix 4: NULL out stale final_score for non-approved KPIs
UPDATE review_submissions rs
SET final_score = NULL, final_rating = NULL
FROM kpis k
WHERE k.id = rs.kpi_id
  AND k.status != 'approved'
  AND (rs.final_score IS NOT NULL OR rs.final_rating IS NOT NULL);

-- Re-enable the trigger
ALTER TABLE public.review_submissions ENABLE TRIGGER check_period_lock_on_submission_update;
