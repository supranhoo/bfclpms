-- Add missing SELECT policy for data owners on review_submissions
-- Without this, data owners cannot see (and therefore cannot update) org-level submissions
CREATE POLICY "Data owners can view org-level submissions"
ON public.review_submissions
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM kpis k
    JOIN org_kpi_data_owners o ON (
      o.category_id = k.category_id
      AND o.kra_name = k.kra_name
      AND o.kpi_name = k.kpi_name
    )
    WHERE k.id = review_submissions.kpi_id
      AND k.is_org_level = true
      AND o.owner_id = auth.uid()
  )
);