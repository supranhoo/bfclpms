CREATE POLICY "Data owners can view org kpi employee profiles"
  ON profiles FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM kpis k
      JOIN org_kpi_data_owners o
        ON o.category_id = k.category_id
        AND o.kra_name = k.kra_name
        AND o.kpi_name = k.kpi_name
      WHERE k.employee_id = profiles.id
        AND k.is_org_level = true
        AND o.owner_id = auth.uid()
    )
  );