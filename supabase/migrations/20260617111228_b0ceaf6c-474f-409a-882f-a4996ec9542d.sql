-- Grant report-only read visibility on incentive records to users with 'reports-incentive' menu access.
-- Without this, users like Sandeep Kumar (200291) saw "0 records" on /reports/incentive
-- even though records existed, because the only SELECT policies covered admin/hr/management/own-record
-- and 'admin-incentive' override — not 'reports-incentive'.
CREATE POLICY "Reports-incentive users can read incentive records"
  ON public.employee_incentive_records
  FOR SELECT
  TO authenticated
  USING (has_menu_access_override(auth.uid(), 'reports-incentive'));