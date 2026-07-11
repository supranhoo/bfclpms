-- Tighten SELECT on review-evidence/org-kpi-evidence/* to authorized roles + data owners.
-- Previous policy allowed any authenticated user to read files under this path.
DROP POLICY IF EXISTS "Org KPI evidence select" ON storage.objects;

CREATE POLICY "Org KPI evidence select"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'review-evidence'
  AND (storage.foldername(name))[1] = 'org-kpi-evidence'
  AND (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'hr_pms'::public.app_role)
    OR public.has_role(auth.uid(), 'auditor'::public.app_role)
    OR public.has_role(auth.uid(), 'management'::public.app_role)
    OR public.has_role(auth.uid(), 'manager'::public.app_role)
    OR public.has_role(auth.uid(), 'skip_level'::public.app_role)
    OR EXISTS (
      SELECT 1 FROM public.org_kpi_data_owners o WHERE o.owner_id = auth.uid()
    )
  )
);