ALTER TABLE public.org_kpi_dataset_defs DROP CONSTRAINT IF EXISTS okdd_granularity_chk;
ALTER TABLE public.org_kpi_dataset_defs ADD CONSTRAINT okdd_granularity_chk
  CHECK (granularity = ANY (ARRAY['weekly','monthly','bi_monthly','quarterly','half_yearly','yearly','event']));

ALTER TABLE public.org_kpi_dataset_rows
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'entry';

ALTER TABLE public.org_kpi_dataset_rows DROP CONSTRAINT IF EXISTS okdr_source_chk;
ALTER TABLE public.org_kpi_dataset_rows ADD CONSTRAINT okdr_source_chk
  CHECK (source = ANY (ARRAY['entry','import','legacy']));

CREATE INDEX IF NOT EXISTS okdr_dataset_source_idx
  ON public.org_kpi_dataset_rows (dataset_id, source);