
-- Add admin UPDATE policy on kpis table
CREATE POLICY "Admin can update KPI status"
  ON public.kpis FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Add admin UPDATE policy on review_submissions table
CREATE POLICY "Admin can update submissions"
  ON public.review_submissions FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Add admin INSERT policy on kpi_audit_logs (so audit trail is written)
CREATE POLICY "Admin can insert audit logs"
  ON public.kpi_audit_logs FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
