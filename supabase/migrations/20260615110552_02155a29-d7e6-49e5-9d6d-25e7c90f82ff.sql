-- Dev Report — archive current seed data and purge the seed batch.
-- Reseed inserts run as data ops in follow-up steps.

CREATE TABLE IF NOT EXISTS public.dev_report_entries_archive_seed AS
SELECT * FROM public.dev_report_entries WHERE FALSE;

INSERT INTO public.dev_report_entries_archive_seed
SELECT * FROM public.dev_report_entries
WHERE NOT EXISTS (SELECT 1 FROM public.dev_report_entries_archive_seed LIMIT 1);

GRANT SELECT ON public.dev_report_entries_archive_seed TO authenticated;
GRANT ALL ON public.dev_report_entries_archive_seed TO service_role;
ALTER TABLE public.dev_report_entries_archive_seed ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins read archive seed" ON public.dev_report_entries_archive_seed;
CREATE POLICY "Admins read archive seed"
  ON public.dev_report_entries_archive_seed FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- Purge the original synthetic seed batch.
-- Identification: created_by IS NULL (no human author) AND linked_commit IS NULL (pre-pipeline).
-- Preserves any admin-authored rows and any future auto-capture rows (which carry linked_commit).
DELETE FROM public.dev_report_entries
WHERE created_by IS NULL AND linked_commit IS NULL;