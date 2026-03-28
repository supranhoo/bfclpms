
CREATE TABLE public.menu_access_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  menu_key TEXT UNIQUE NOT NULL,
  menu_name TEXT NOT NULL,
  section TEXT NOT NULL,
  allowed_roles TEXT[] NOT NULL DEFAULT '{}',
  display_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.menu_access_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated can read menu config"
  ON public.menu_access_config FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can manage menu config"
  ON public.menu_access_config FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

INSERT INTO public.menu_access_config (menu_key, menu_name, section, allowed_roles, display_order) VALUES
  ('dashboard', 'My Dashboard', 'main', '{admin,manager,employee,auditor,management,hr_pms,skip_level}', 1),
  ('inbox', 'Inbox', 'main', '{employee,manager,admin,auditor,management,hr_pms,skip_level}', 2),
  ('pms-policy', 'PMS Policy', 'main', '{admin,manager,employee,auditor,management,hr_pms}', 3),
  ('team-reviews', 'Team Reviews', 'manager', '{manager,admin,management,skip_level}', 10),
  ('hr-pms-review', 'HR PMS Review', 'hr_pms', '{hr_pms,admin}', 20),
  ('management-dashboard', 'Management Dashboard', 'management', '{management,admin}', 30),
  ('management-review', 'Management Review', 'management', '{management,admin}', 31),
  ('audit-panel', 'Audit Panel', 'audit', '{auditor,admin}', 40),
  ('admin-dashboard', 'Admin Dashboard', 'admin', '{admin}', 50),
  ('admin-users', 'User Management', 'admin', '{admin}', 51),
  ('admin-templates', 'KRA Library', 'admin', '{admin}', 52),
  ('admin-bundles', 'KRA Bundles', 'admin', '{admin}', 53),
  ('admin-kpis', 'All KRAs', 'admin', '{admin}', 54),
  ('admin-org-kpi-data', 'Org KPI Data Entry', 'admin', '{admin}', 55),
  ('admin-org-kpi-overview', 'Org KPI Overview', 'admin', '{admin}', 56),
  ('admin-pip', 'PIP Management', 'admin', '{admin}', 57),
  ('admin-workflow', 'Workflow Config', 'admin', '{admin}', 58),
  ('admin-organization', 'Organization', 'admin', '{admin}', 59),
  ('admin-categories', 'KRA Categories', 'admin', '{admin}', 60),
  ('admin-review-periods', 'Review Periods', 'admin', '{admin}', 61),
  ('admin-import', 'Import Data', 'admin', '{admin}', 62),
  ('admin-settings', 'System Settings', 'admin', '{admin}', 63),
  ('admin-audit-logs', 'Audit Logs', 'admin', '{admin}', 64),
  ('admin-observations', 'Observations', 'admin', '{admin}', 65),
  ('admin-rollback', 'Rollback Requests', 'admin', '{admin}', 66),
  ('admin-email-logs', 'Email Logs', 'admin', '{admin}', 67),
  ('admin-kpi-mapping', 'KPI Mapping', 'admin', '{admin}', 68),
  ('admin-weightage', 'Weightage Matrix', 'admin', '{admin}', 69),
  ('admin-pending-reviews', 'Pending Reviews', 'admin', '{admin}', 70),
  ('admin-incentive', 'Incentive Config', 'admin', '{admin}', 71),
  ('admin-development', 'Employee Development', 'admin', '{admin,hr_pms}', 72),
  ('data-entry', 'Org KPI Data Entry', 'dataEntry', '{employee,manager,auditor,management,hr_pms}', 80),
  ('reports-hub', 'View Reports', 'reports', '{admin,manager,auditor,management}', 100),
  ('reports-performance', 'Performance Report', 'reports', '{admin,manager,auditor}', 101),
  ('reports-kra-issuance', 'KRA Issuance', 'reports', '{admin,manager,auditor}', 102),
  ('reports-tni', 'TNI Report', 'reports', '{admin,manager,auditor}', 103),
  ('reports-incentive', 'Incentive Report', 'reports', '{admin,management,hr_pms}', 104),
  ('reports-manager-team', 'Manager Team KPI', 'reports', '{admin,manager,management,hr_pms}', 105)
ON CONFLICT (menu_key) DO NOTHING;
