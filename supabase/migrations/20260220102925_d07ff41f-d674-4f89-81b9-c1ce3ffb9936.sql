CREATE POLICY "Data owners can update org-level KPI status"
ON public.kpis
FOR UPDATE
USING (
  is_org_level = true
  AND EXISTS (
    SELECT 1
    FROM org_kpi_data_owners o
    WHERE o.category_id = kpis.category_id
      AND o.kra_name = kpis.kra_name
      AND o.kpi_name = kpis.kpi_name
      AND o.owner_id = auth.uid()
  )
);