-- Speed up month filter and ordering
CREATE INDEX IF NOT EXISTS idx_dev_report_entries_entry_date
  ON public.dev_report_entries (entry_date DESC NULLS LAST);

-- Idempotency for auto-capture pipeline (dev-report-ingest edge function).
-- Allows the same logical change to be re-posted without duplicating rows.
CREATE UNIQUE INDEX IF NOT EXISTS uq_dev_report_entries_ingest_key
  ON public.dev_report_entries (
    entry_type,
    COALESCE(entry_date, DATE '1970-01-01'),
    COALESCE(linked_commit, ''),
    title
  );