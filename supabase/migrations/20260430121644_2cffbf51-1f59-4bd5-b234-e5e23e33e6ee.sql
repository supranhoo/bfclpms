ALTER TABLE public.review_action_notes
  ADD COLUMN IF NOT EXISTS applicable_from DATE NULL;

COMMENT ON COLUMN public.review_action_notes.applicable_from
  IS 'Month (always day=1) when the captured change should take effect.';

CREATE INDEX IF NOT EXISTS idx_ran_applicable_from
  ON public.review_action_notes(applicable_from);