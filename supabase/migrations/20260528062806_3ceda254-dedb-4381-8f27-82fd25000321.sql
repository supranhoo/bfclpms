-- Performance fix: wrap auth.uid() and has_role() in scalar sub-selects so Postgres
-- promotes them to InitPlans evaluated once per query, not per row.
-- Logic is identical; only the evaluation form changes.

-- ============ SELECT policies on public.kpis ============
DROP POLICY IF EXISTS "Admins and auditors can view all KPIs" ON public.kpis;
CREATE POLICY "Admins and auditors can view all KPIs"
ON public.kpis FOR SELECT
USING (
  (SELECT public.has_role((SELECT auth.uid()), 'admin'::public.app_role))
  OR (SELECT public.has_role((SELECT auth.uid()), 'auditor'::public.app_role))
);

DROP POLICY IF EXISTS "Data owners can view assigned org-level KPIs" ON public.kpis;
CREATE POLICY "Data owners can view assigned org-level KPIs"
ON public.kpis FOR SELECT
USING (
  is_org_level = true
  AND EXISTS (
    SELECT 1
    FROM public.org_kpi_data_owners o
    WHERE o.owner_id = (SELECT auth.uid())
      AND o.category_id = kpis.category_id
      AND public.normalize_kpi_text(o.kra_name) = public.normalize_kpi_text(kpis.kra_name)
      AND public.normalize_kpi_text(o.kpi_name) = public.normalize_kpi_text(kpis.kpi_name)
  )
);

DROP POLICY IF EXISTS "Employees can view their own KPIs" ON public.kpis;
CREATE POLICY "Employees can view their own KPIs"
ON public.kpis FOR SELECT
USING (employee_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "HR PMS can view all KPIs" ON public.kpis;
CREATE POLICY "HR PMS can view all KPIs"
ON public.kpis FOR SELECT
USING ((SELECT public.has_role((SELECT auth.uid()), 'hr_pms'::public.app_role)));

DROP POLICY IF EXISTS "Management can view all KPIs" ON public.kpis;
CREATE POLICY "Management can view all KPIs"
ON public.kpis FOR SELECT
USING ((SELECT public.has_role((SELECT auth.uid()), 'management'::public.app_role)));

DROP POLICY IF EXISTS "Managers can view their reports' KPIs" ON public.kpis;
CREATE POLICY "Managers can view their reports' KPIs"
ON public.kpis FOR SELECT
USING (
  (SELECT public.has_role((SELECT auth.uid()), 'manager'::public.app_role))
  AND EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = kpis.employee_id
      AND profiles.reporting_manager_id = (SELECT auth.uid())
  )
);

DROP POLICY IF EXISTS "Mentioned users can view KPI" ON public.kpis;
CREATE POLICY "Mentioned users can view KPI"
ON public.kpis FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.kpi_mention_access
    WHERE kpi_mention_access.kpi_id = kpis.id
      AND kpi_mention_access.user_id = (SELECT auth.uid())
  )
);

DROP POLICY IF EXISTS "Report override users can view all KPIs" ON public.kpis;
CREATE POLICY "Report override users can view all KPIs"
ON public.kpis FOR SELECT
USING ((SELECT public.has_report_access_override((SELECT auth.uid()))));

DROP POLICY IF EXISTS "Skip-level managers can view reports KPIs" ON public.kpis;
CREATE POLICY "Skip-level managers can view reports KPIs"
ON public.kpis FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = kpis.employee_id
      AND public.get_skip_level_manager(p.id) = (SELECT auth.uid())
  )
);
