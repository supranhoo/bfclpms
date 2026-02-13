
CREATE POLICY "Admins can delete KPIs"
  ON public.kpis
  FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
