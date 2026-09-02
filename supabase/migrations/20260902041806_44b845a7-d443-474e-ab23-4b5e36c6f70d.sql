ALTER TABLE public.kpi_scoring_scales
  ADD COLUMN IF NOT EXISTS scale_kind text NOT NULL DEFAULT 'tiered',
  ADD COLUMN IF NOT EXISTS description text;

CREATE INDEX IF NOT EXISTS kpi_scoring_scales_active_kind_idx
  ON public.kpi_scoring_scales (scale_kind, is_active);