-- Step A.1: Archive duplicate active rows, keep only the highest version per scope active.
WITH ranked AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY assessment_year,
                        COALESCE(company_id::text, ''),
                        COALESCE(division_id::text, ''),
                        COALESCE(business_unit_id::text, ''),
                        COALESCE(category_id::text, ''),
                        COALESCE(level_id::text, ''),
                        COALESCE(location_id::text, '')
           ORDER BY version DESC, created_at DESC
         ) AS rn
  FROM public.increment_method_configs
  WHERE status = 'active'
)
UPDATE public.increment_method_configs c
SET status = 'archived',
    updated_at = now()
FROM ranked r
WHERE c.id = r.id AND r.rn > 1;

-- Step A.2: Prevent future duplicate active rows per (assessment_year, scope).
CREATE UNIQUE INDEX IF NOT EXISTS increment_method_configs_one_active_per_scope
ON public.increment_method_configs (
  assessment_year,
  COALESCE(company_id, '00000000-0000-0000-0000-000000000000'::uuid),
  COALESCE(division_id, '00000000-0000-0000-0000-000000000000'::uuid),
  COALESCE(business_unit_id, '00000000-0000-0000-0000-000000000000'::uuid),
  COALESCE(category_id, '00000000-0000-0000-0000-000000000000'::uuid),
  COALESCE(level_id, '00000000-0000-0000-0000-000000000000'::uuid),
  COALESCE(location_id, '00000000-0000-0000-0000-000000000000'::uuid)
)
WHERE status = 'active';