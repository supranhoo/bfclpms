
DROP POLICY IF EXISTS "Org KPI evidence insert" ON storage.objects;
CREATE POLICY "Org KPI evidence insert"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'review-evidence'
  AND (storage.foldername(name))[1] = 'org-kpi-evidence'
  AND (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'hr_pms'::public.app_role)
    OR EXISTS (SELECT 1 FROM public.org_kpi_data_owners o WHERE o.owner_id = auth.uid())
  )
);

DROP POLICY IF EXISTS "Org KPI evidence update" ON storage.objects;
CREATE POLICY "Org KPI evidence update"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'review-evidence'
  AND (storage.foldername(name))[1] = 'org-kpi-evidence'
  AND (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'hr_pms'::public.app_role)
    OR EXISTS (SELECT 1 FROM public.org_kpi_data_owners o WHERE o.owner_id = auth.uid())
  )
);

DROP POLICY IF EXISTS "Org KPI evidence delete" ON storage.objects;
CREATE POLICY "Org KPI evidence delete"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'review-evidence'
  AND (storage.foldername(name))[1] = 'org-kpi-evidence'
  AND (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'hr_pms'::public.app_role)
    OR EXISTS (SELECT 1 FROM public.org_kpi_data_owners o WHERE o.owner_id = auth.uid())
  )
);
