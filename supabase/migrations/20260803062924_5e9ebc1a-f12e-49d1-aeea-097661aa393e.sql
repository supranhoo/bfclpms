-- ADR-233: Scope Org KPI evidence writes to the uploader.
-- Files live in a flat `org-kpi-evidence/` prefix with no KPI id in the path,
-- so a path->KPI join is impossible; instead we scope edits/deletes to the
-- object's uploader (storage.objects.owner), with admin/hr_pms override.

DROP POLICY IF EXISTS "Org KPI evidence update" ON storage.objects;
DROP POLICY IF EXISTS "Org KPI evidence delete" ON storage.objects;
DROP POLICY IF EXISTS "Org KPI evidence insert" ON storage.objects;

CREATE POLICY "Org KPI evidence insert"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'review-evidence'
  AND (storage.foldername(name))[1] = 'org-kpi-evidence'
  AND owner = auth.uid()
  AND (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'hr_pms'::app_role)
    OR EXISTS (SELECT 1 FROM public.org_kpi_data_owners o WHERE o.owner_id = auth.uid())
  )
);

CREATE POLICY "Org KPI evidence update"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'review-evidence'
  AND (storage.foldername(name))[1] = 'org-kpi-evidence'
  AND (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'hr_pms'::app_role)
    OR owner = auth.uid()
  )
)
WITH CHECK (
  bucket_id = 'review-evidence'
  AND (storage.foldername(name))[1] = 'org-kpi-evidence'
  AND (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'hr_pms'::app_role)
    OR owner = auth.uid()
  )
);

CREATE POLICY "Org KPI evidence delete"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'review-evidence'
  AND (storage.foldername(name))[1] = 'org-kpi-evidence'
  AND (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'hr_pms'::app_role)
    OR owner = auth.uid()
  )
);