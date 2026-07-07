ALTER TABLE public.annual_review_instances
  ADD COLUMN IF NOT EXISTS system_scores_raw jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.annual_review_instances.system_scores_raw IS
  'Raw System KPI values keyed in by HR (e.g. LTI count, 5S rating). Converted to scaled points in system_scores via each template''s scoring_rules bands. See POLICY §AR-SYSTEM-KPI-RAW-INPUT.';