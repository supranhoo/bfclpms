-- Add scoring mode to kra_categories
ALTER TABLE kra_categories ADD COLUMN IF NOT EXISTS org_scoring_mode text DEFAULT 'individual';

-- Add threshold columns to org_kpi_values for uniform scoring mode
ALTER TABLE org_kpi_values 
  ADD COLUMN IF NOT EXISTS target_value numeric,
  ADD COLUMN IF NOT EXISTS r5 text,
  ADD COLUMN IF NOT EXISTS r4 text,
  ADD COLUMN IF NOT EXISTS r3 text,
  ADD COLUMN IF NOT EXISTS r2 text,
  ADD COLUMN IF NOT EXISTS r1 text,
  ADD COLUMN IF NOT EXISTS r0 text,
  ADD COLUMN IF NOT EXISTS criteria text DEFAULT 'Higher is Better';

-- Add comment for documentation
COMMENT ON COLUMN kra_categories.org_scoring_mode IS 'Scoring mode for org-level categories: individual (use employee KPI thresholds) or uniform (use org_kpi_values thresholds)';