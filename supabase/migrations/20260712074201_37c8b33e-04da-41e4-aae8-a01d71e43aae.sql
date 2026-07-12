DROP POLICY IF EXISTS "Authenticated can view report user overrides" ON public.report_access_user_overrides;

CREATE POLICY "Admins and HR PMS can view report user overrides"
ON public.report_access_user_overrides
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'hr_pms'::app_role)
  OR user_id = auth.uid()
);