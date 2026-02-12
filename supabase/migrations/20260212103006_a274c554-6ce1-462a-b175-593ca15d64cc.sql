CREATE POLICY "Data owners can view assigned org-level KPIs"
  ON public.kpis
  FOR SELECT
  TO authenticated
  USING (
    is_org_level = true
    AND EXISTS (
      SELECT 1
      FROM org_kpi_data_owners
      WHERE org_kpi_data_owners.category_id = kpis.category_id
        AND org_kpi_data_owners.kra_name = kpis.kra_name
        AND org_kpi_data_owners.kpi_name = kpis.kpi_name
        AND org_kpi_data_owners.owner_id = auth.uid()
    )
  );