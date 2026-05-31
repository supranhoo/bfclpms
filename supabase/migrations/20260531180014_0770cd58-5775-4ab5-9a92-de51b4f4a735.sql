ALTER TABLE public.increment_run_items
  ADD COLUMN IF NOT EXISTS transition_key text NULL,
  ADD COLUMN IF NOT EXISTS pre_confirmation_status text NULL,
  ADD COLUMN IF NOT EXISTS transition_source text NULL
    CHECK (transition_source IS NULL OR transition_source IN ('history','profile_snapshot','none'));