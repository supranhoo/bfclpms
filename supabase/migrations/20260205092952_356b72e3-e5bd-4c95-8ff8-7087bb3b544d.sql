-- Policy 1: Managers can update their reports' KPIs
CREATE POLICY "Managers can update reports KPI status"
ON public.kpis
FOR UPDATE
TO authenticated
USING (
  has_role(auth.uid(), 'manager'::app_role) 
  AND EXISTS (
    SELECT 1 FROM profiles 
    WHERE profiles.id = kpis.employee_id 
    AND profiles.reporting_manager_id = auth.uid()
  )
);

-- Policy 2: Auditors can update any KPI status
CREATE POLICY "Auditors can update KPI status"
ON public.kpis
FOR UPDATE
TO authenticated
USING (
  has_role(auth.uid(), 'auditor'::app_role)
);

-- Policy 3: Management can update KPIs during management_review
CREATE POLICY "Management can update KPI status during review"
ON public.kpis
FOR UPDATE
TO authenticated
USING (
  has_role(auth.uid(), 'management'::app_role)
  AND status = 'management_review'
);