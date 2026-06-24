ALTER TABLE public.annual_review_cycles
  ADD COLUMN IF NOT EXISTS dept_review_start timestamptz NULL,
  ADD COLUMN IF NOT EXISTS dept_review_end   timestamptz NULL;
COMMENT ON COLUMN public.annual_review_cycles.dept_review_start IS 'Optional window start for the Department Head stage. NULL = no enforced window.';
COMMENT ON COLUMN public.annual_review_cycles.dept_review_end   IS 'Optional window end for the Department Head stage. NULL = no enforced window.';