CREATE POLICY "Audit reviewers can view org kpi employee profiles"
ON public.profiles FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM kpis k
    WHERE k.employee_id = profiles.id
      AND k.is_org_level = true
      AND k.status IN ('audit', 'management_review', 'approved')
  )
);