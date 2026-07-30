DROP POLICY IF EXISTS "Authenticated users can read vessel rates" ON public.incentive_vessel_rates;

CREATE POLICY "Vessel rates readable by owners and incentive roles"
  ON public.incentive_vessel_rates
  FOR SELECT TO authenticated
  USING (
    employee_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'hr_pms'::app_role)
    OR public.has_role(auth.uid(), 'management'::app_role)
    OR public.has_menu_access_override(auth.uid(), 'admin-incentive'::text)
    OR public.has_menu_access_override(auth.uid(), 'admin-incentive-data'::text)
  );