
-- Fix: Add hr_pms role to kpi_observations INSERT policy (skip_level is not an app_role enum value)
DROP POLICY IF EXISTS "Users can create observations" ON public.kpi_observations;

CREATE POLICY "Users can create observations"
ON public.kpi_observations FOR INSERT TO authenticated
WITH CHECK (
  created_by = auth.uid() AND (
    EXISTS (SELECT 1 FROM kpis WHERE kpis.id = kpi_observations.kpi_id AND kpis.employee_id = auth.uid())
    OR has_role(auth.uid(), 'manager'::app_role)
    OR has_role(auth.uid(), 'auditor'::app_role)
    OR has_role(auth.uid(), 'management'::app_role)
    OR has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'hr_pms'::app_role)
  )
);
