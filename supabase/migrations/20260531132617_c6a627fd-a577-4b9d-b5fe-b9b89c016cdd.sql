ALTER TABLE public.increment_run_items
  ADD COLUMN IF NOT EXISTS criteria_exempt boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS exemption_reason text NULL;