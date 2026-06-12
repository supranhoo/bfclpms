DROP POLICY IF EXISTS "Safety users read own folder; officers/admins read all" ON storage.objects;

CREATE POLICY "Safety media read: uploader, roles, or incident viewer"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'safety-media'
  AND (
    (auth.uid())::text = (storage.foldername(name))[1]
    OR has_safety_role(auth.uid(), 'admin'::safety_app_role)
    OR has_safety_role(auth.uid(), 'safety_head'::safety_app_role)
    OR has_safety_role(auth.uid(), 'safety_officer'::safety_app_role)
    OR has_safety_role(auth.uid(), 'auditor'::safety_app_role)
    OR EXISTS (
      SELECT 1 FROM public.safety_incident_evidence e
      WHERE e.file_path = storage.objects.name
        AND public.can_view_safety_incident(e.incident_id)
    )
  )
);