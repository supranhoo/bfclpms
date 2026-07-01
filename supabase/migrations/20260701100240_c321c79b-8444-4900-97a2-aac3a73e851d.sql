-- ADR-104: Restore employee read access to Org-KPI supporting evidence.
-- The 2026-06-26 hardening migration added INSERT/UPDATE/DELETE policies for
-- the `org-kpi-evidence/` prefix but no SELECT counterpart, and the
-- per-employee SELECT policy `Users can view authorized evidence` only
-- matches paths whose first folder segment is a profile UUID. As a result
-- ordinary employees could not preview or download Org-KPI attachments.
DROP POLICY IF EXISTS "Org KPI evidence select" ON storage.objects;
CREATE POLICY "Org KPI evidence select"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'review-evidence'
  AND (storage.foldername(name))[1] = 'org-kpi-evidence'
);