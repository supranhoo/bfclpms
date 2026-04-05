
-- Temporarily disable the frequency lock trigger for this corrective migration
ALTER TABLE public.kpis DISABLE TRIGGER kpi_frequency_lock_check;

-- Step 1: Log audit entries for affected KPIs
INSERT INTO kpi_audit_logs (kpi_id, action, performed_by, old_value, new_value, metadata)
SELECT 
  k.id,
  'ADMIN_BULK_STEP_BACK',
  NULL,
  jsonb_build_object('status', k.status::text),
  jsonb_build_object('status', 'kra_set'),
  jsonb_build_object(
    'reason', 'Reverting premature review — multi-month KPI reviewed before cycle completion (§58)',
    'tool', 'bulk_step_back_premature_multimonth',
    'frequency', k.frequency,
    'review_period', k.review_period
  )
FROM kpis k
WHERE k.review_year = 2026
  AND k.status != 'kra_set'
  AND (
    (k.frequency = 'Quarterly' AND k.review_period IN ('January', 'February'))
    OR (k.frequency = 'Quarterly' AND k.review_period = 'March' AND k.status = 'self_review')
    OR (k.frequency = 'Bi-Monthly' AND k.review_period = 'January' AND k.status != 'kra_set')
  );

-- Step 2: Clear review submissions for affected KPIs
DELETE FROM review_submissions
WHERE kpi_id IN (
  SELECT k.id FROM kpis k
  WHERE k.review_year = 2026
    AND k.status != 'kra_set'
    AND (
      (k.frequency = 'Quarterly' AND k.review_period IN ('January', 'February'))
      OR (k.frequency = 'Quarterly' AND k.review_period = 'March' AND k.status = 'self_review')
      OR (k.frequency = 'Bi-Monthly' AND k.review_period = 'January' AND k.status != 'kra_set')
    )
);

-- Step 3: Reset KPI statuses to kra_set
UPDATE kpis SET status = 'kra_set'
WHERE review_year = 2026
  AND status != 'kra_set'
  AND (
    (frequency = 'Quarterly' AND review_period IN ('January', 'February'))
    OR (frequency = 'Quarterly' AND review_period = 'March' AND status = 'self_review')
    OR (frequency = 'Bi-Monthly' AND review_period = 'January' AND status != 'kra_set')
  );

-- Re-enable the trigger
ALTER TABLE public.kpis ENABLE TRIGGER kpi_frequency_lock_check;
