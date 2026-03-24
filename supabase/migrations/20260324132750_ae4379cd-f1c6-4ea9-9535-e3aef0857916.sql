
-- Allow any authenticated user to view profiles of org KPI data owners
CREATE POLICY "Authenticated users can view org kpi data owner profiles"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.org_kpi_data_owners
      WHERE org_kpi_data_owners.owner_id = profiles.id
    )
  );

-- Allow any authenticated user to view profiles of org KPI value enterers
CREATE POLICY "Authenticated users can view org kpi value enterer profiles"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.org_kpi_values
      WHERE org_kpi_values.entered_by = profiles.id
    )
  );
