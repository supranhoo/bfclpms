-- Restrict SELECT on reference/master tables to authenticated only.
-- Previously these policies were attached to the {public} role (= anon + authenticated),
-- exposing proprietary KPI templates, designations and PMS grades to anonymous internet users.

DROP POLICY IF EXISTS "Authenticated users can view kpi_templates" ON public.kpi_templates;
CREATE POLICY "Authenticated users can view kpi_templates"
  ON public.kpi_templates
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Authenticated users can view designations" ON public.designations;
CREATE POLICY "Authenticated users can view designations"
  ON public.designations
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Authenticated users can view pms_grades" ON public.pms_grades;
CREATE POLICY "Authenticated users can view pms_grades"
  ON public.pms_grades
  FOR SELECT
  TO authenticated
  USING (true);