CREATE POLICY "Managers can view skip-level reports"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (
    has_role(auth.uid(), 'manager'::app_role)
    AND reporting_manager_id IN (
      SELECT id FROM public.profiles
      WHERE reporting_manager_id = auth.uid()
    )
  );