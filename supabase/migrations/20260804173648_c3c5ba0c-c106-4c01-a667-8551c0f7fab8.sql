ALTER TABLE public.dev_report_entries
  ADD COLUMN IF NOT EXISTS rationale text,
  ADD COLUMN IF NOT EXISTS usage_notes text;

COMMENT ON COLUMN public.dev_report_entries.rationale IS 'ADR-249: why this was built (problem/context). NULL when no genuine source section exists.';
COMMENT ON COLUMN public.dev_report_entries.usage_notes IS 'ADR-249: how this is used (who/where/what it enables). NULL when no genuine source section exists.';