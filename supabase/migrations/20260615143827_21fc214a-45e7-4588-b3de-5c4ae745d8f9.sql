ALTER TABLE public.annual_review_instances 
  ADD COLUMN IF NOT EXISTS carry_score_snapshots jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.annual_review_instances.carry_score_snapshots IS 
  'Cached per-system-score snapshots for source=carry_kra: { [systemScoreId]: { monthly:[{month,avg,count}], value, computed_at, fiscal_year, config } }';