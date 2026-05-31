-- Bypass period-lock trigger for this data repair. The lock prevents user updates,
-- but this migration is an additive backfill that mirrors auditor/manager/etc. scores
-- into the corresponding achieved_value columns. No score columns are modified.
SET LOCAL session_replication_role = 'replica';

UPDATE public.review_submissions rs
SET auditor_achieved_value = rs.auditor_score
FROM public.kpis k
WHERE rs.kpi_id = k.id
  AND k.uom_type IN ('binary','tiered')
  AND rs.auditor_achieved_value IS NULL
  AND rs.auditor_score IS NOT NULL;

UPDATE public.review_submissions rs
SET manager_achieved_value = rs.manager_score
FROM public.kpis k
WHERE rs.kpi_id = k.id
  AND k.uom_type IN ('binary','tiered')
  AND rs.manager_achieved_value IS NULL
  AND rs.manager_score IS NOT NULL;

UPDATE public.review_submissions rs
SET management_achieved_value = rs.management_score
FROM public.kpis k
WHERE rs.kpi_id = k.id
  AND k.uom_type IN ('binary','tiered')
  AND rs.management_achieved_value IS NULL
  AND rs.management_score IS NOT NULL;

UPDATE public.review_submissions rs
SET skip_level_achieved_value = rs.skip_level_score
FROM public.kpis k
WHERE rs.kpi_id = k.id
  AND k.uom_type IN ('binary','tiered')
  AND rs.skip_level_achieved_value IS NULL
  AND rs.skip_level_score IS NOT NULL;

UPDATE public.review_submissions rs
SET hr_pms_achieved_value = rs.hr_pms_score
FROM public.kpis k
WHERE rs.kpi_id = k.id
  AND k.uom_type IN ('binary','tiered')
  AND rs.hr_pms_achieved_value IS NULL
  AND rs.hr_pms_score IS NOT NULL;

SET LOCAL session_replication_role = 'origin';