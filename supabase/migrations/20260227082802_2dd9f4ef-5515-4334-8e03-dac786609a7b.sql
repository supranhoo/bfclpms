
-- Add visibility column to kpi_observations
ALTER TABLE kpi_observations
  ADD COLUMN visibility text NOT NULL DEFAULT 'public';

-- Drop existing SELECT policies
DROP POLICY IF EXISTS "Users can view observations for accessible KPIs" ON kpi_observations;
DROP POLICY IF EXISTS "HR PMS can view all observations" ON kpi_observations;
DROP POLICY IF EXISTS "Skip-level can view observations" ON kpi_observations;

-- Re-create SELECT policies with visibility filter
-- Policy 1: Users can view observations for accessible KPIs (employee, manager, admin, auditor, management)
CREATE POLICY "Users can view observations for accessible KPIs"
ON kpi_observations FOR SELECT TO authenticated
USING (
  (visibility = 'public' OR has_role(auth.uid(), 'auditor'::app_role) OR has_role(auth.uid(), 'admin'::app_role))
  AND
  (EXISTS (
    SELECT 1 FROM kpis
    WHERE kpis.id = kpi_observations.kpi_id
    AND (
      kpis.employee_id = auth.uid()
      OR (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = kpis.employee_id AND profiles.reporting_manager_id = auth.uid()))
      OR has_role(auth.uid(), 'admin'::app_role)
      OR has_role(auth.uid(), 'auditor'::app_role)
      OR has_role(auth.uid(), 'management'::app_role)
    )
  ))
);

-- Policy 2: HR PMS can view all public observations
CREATE POLICY "HR PMS can view all observations"
ON kpi_observations FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'hr_pms'::app_role)
  AND (visibility = 'public' OR has_role(auth.uid(), 'auditor'::app_role) OR has_role(auth.uid(), 'admin'::app_role))
);

-- Policy 3: Skip-level can view observations
CREATE POLICY "Skip-level can view observations"
ON kpi_observations FOR SELECT TO authenticated
USING (
  (visibility = 'public' OR has_role(auth.uid(), 'auditor'::app_role) OR has_role(auth.uid(), 'admin'::app_role))
  AND
  (EXISTS (
    SELECT 1 FROM kpis k
    JOIN profiles p ON k.employee_id = p.id
    WHERE k.id = kpi_observations.kpi_id
    AND get_skip_level_manager(p.id) = auth.uid()
  ))
);
