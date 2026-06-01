ALTER TABLE public.increment_run_items
  ADD COLUMN IF NOT EXISTS evidence_urls jsonb NOT NULL DEFAULT '[]'::jsonb;