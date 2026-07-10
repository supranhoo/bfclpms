
DROP POLICY IF EXISTS "Reviewers can action rollback requests" ON public.kpi_rollback_requests;

CREATE POLICY "Reviewers can action rollback requests"
ON public.kpi_rollback_requests
FOR UPDATE
TO authenticated
USING (
  auth.uid() <> requested_by
  AND (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'hr_pms'::app_role)
    OR public.has_role(auth.uid(), 'management'::app_role)
    OR public.has_role(auth.uid(), 'auditor'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.kpis k
      JOIN public.profiles p ON p.id = k.employee_id
      WHERE k.id = kpi_rollback_requests.kpi_id
        AND (
          p.reporting_manager_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM public.profiles pm
            WHERE pm.id = p.reporting_manager_id
              AND pm.reporting_manager_id = auth.uid()
          )
        )
    )
  )
)
WITH CHECK (
  auth.uid() <> requested_by
  AND (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'hr_pms'::app_role)
    OR public.has_role(auth.uid(), 'management'::app_role)
    OR public.has_role(auth.uid(), 'auditor'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.kpis k
      JOIN public.profiles p ON p.id = k.employee_id
      WHERE k.id = kpi_rollback_requests.kpi_id
        AND (
          p.reporting_manager_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM public.profiles pm
            WHERE pm.id = p.reporting_manager_id
              AND pm.reporting_manager_id = auth.uid()
          )
        )
    )
  )
);
