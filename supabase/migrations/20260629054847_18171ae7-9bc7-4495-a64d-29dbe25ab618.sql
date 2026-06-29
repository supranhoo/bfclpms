
-- ADR-096: admin/HR-PMS on-behalf write access to review-evidence bucket.
-- Additive permissive policies; existing per-user and Org-KPI policies stay in place.

CREATE POLICY "Admins and HR PMS can upload evidence on behalf"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'review-evidence'
  AND (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'hr_pms'::public.app_role)
  )
);

CREATE POLICY "Admins and HR PMS can update evidence on behalf"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'review-evidence'
  AND (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'hr_pms'::public.app_role)
  )
)
WITH CHECK (
  bucket_id = 'review-evidence'
  AND (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'hr_pms'::public.app_role)
  )
);

CREATE POLICY "Admins and HR PMS can delete evidence on behalf"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'review-evidence'
  AND (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'hr_pms'::public.app_role)
  )
);
