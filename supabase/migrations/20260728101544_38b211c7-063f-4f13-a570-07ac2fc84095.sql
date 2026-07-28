-- ADR-190 / POLICY §EVIDENCE-READ-KPI-PARTICIPATION
-- Review evidence read access must follow KPI participation, not the folder
-- of whoever uploaded the file. Reviewer/auditor uploads land under the
-- uploader's uid (see src/components/ui/EvidenceUpload.tsx), so the KPI owner
-- was denied SELECT by "Users can view authorized evidence" (folder[1] match).
-- Additive policy: nothing existing is dropped or narrowed.

DROP POLICY IF EXISTS "Review evidence readable by KPI participants" ON storage.objects;

CREATE POLICY "Review evidence readable by KPI participants"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'review-evidence'
  AND (storage.foldername(name))[2] ~ '^[0-9a-fA-F-]{36}$'
  AND (
    (storage.foldername(name))[3] IS NULL
    OR (storage.foldername(name))[3] IN (
      'self-evidence',
      'reviewer-evidence',
      'auditor-evidence',
      'management-evidence',
      'observation-evidence',
      'observation-replies'
    )
  )
  AND EXISTS (
    SELECT 1
    FROM public.kpis k
    LEFT JOIN public.profiles emp ON emp.id = k.employee_id
    LEFT JOIN public.profiles mgr ON mgr.id = emp.reporting_manager_id
    WHERE k.id::text = (storage.foldername(objects.name))[2]
      AND (
        k.employee_id = auth.uid()
        OR emp.reporting_manager_id = auth.uid()
        OR mgr.reporting_manager_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.audit_kpi_assignments a
          WHERE a.employee_id = k.employee_id AND a.auditor_id = auth.uid()
        )
        OR EXISTS (
          SELECT 1 FROM public.audit_kpi_level_assignments la
          WHERE la.kpi_id = k.id AND la.auditor_id = auth.uid()
        )
        OR EXISTS (
          SELECT 1 FROM public.kpi_mention_access m
          WHERE m.kpi_id = k.id AND m.user_id = auth.uid()
        )
      )
  )
);
