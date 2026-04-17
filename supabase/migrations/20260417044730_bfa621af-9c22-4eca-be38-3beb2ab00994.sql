-- Add multi-dimension scope columns + effective_from to incentive_slabs
ALTER TABLE public.incentive_slabs
  ADD COLUMN IF NOT EXISTS company_id    uuid REFERENCES public.companies(id),
  ADD COLUMN IF NOT EXISTS division_id   uuid REFERENCES public.divisions(id),
  ADD COLUMN IF NOT EXISTS pms_grade_id  uuid REFERENCES public.pms_grades(id),
  ADD COLUMN IF NOT EXISTS location      text,
  ADD COLUMN IF NOT EXISTS pms_level     text,
  ADD COLUMN IF NOT EXISTS effective_from date;

-- Backfill effective_from from created_at for existing rows
UPDATE public.incentive_slabs
   SET effective_from = COALESCE(effective_from, created_at::date, CURRENT_DATE)
 WHERE effective_from IS NULL;

ALTER TABLE public.incentive_slabs
  ALTER COLUMN effective_from SET NOT NULL,
  ALTER COLUMN effective_from SET DEFAULT CURRENT_DATE;

CREATE INDEX IF NOT EXISTS idx_slabs_program_eff
  ON public.incentive_slabs (program_id, effective_from DESC);
CREATE INDEX IF NOT EXISTS idx_slabs_scope_lookup
  ON public.incentive_slabs (program_id, slab_category, effective_from DESC);