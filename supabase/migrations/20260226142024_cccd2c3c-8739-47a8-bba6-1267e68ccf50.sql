
-- Table 1: Role-based report access config
CREATE TABLE public.report_access_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_key text UNIQUE NOT NULL,
  report_name text NOT NULL,
  view_roles public.app_role[] NOT NULL DEFAULT '{}',
  download_roles public.app_role[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.report_access_config ENABLE ROW LEVEL SECURITY;

-- All authenticated can read (for permission checks)
CREATE POLICY "Authenticated can view report access config"
  ON public.report_access_config FOR SELECT TO authenticated USING (true);

-- Only admins can modify
CREATE POLICY "Admins can insert report access config"
  ON public.report_access_config FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update report access config"
  ON public.report_access_config FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete report access config"
  ON public.report_access_config FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Table 2: User-level overrides
CREATE TABLE public.report_access_user_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_key text NOT NULL,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  can_view boolean NOT NULL DEFAULT true,
  can_download boolean NOT NULL DEFAULT false,
  granted_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(report_key, user_id)
);

ALTER TABLE public.report_access_user_overrides ENABLE ROW LEVEL SECURITY;

-- All authenticated can read
CREATE POLICY "Authenticated can view report user overrides"
  ON public.report_access_user_overrides FOR SELECT TO authenticated USING (true);

-- Only admins can modify
CREATE POLICY "Admins can insert report user overrides"
  ON public.report_access_user_overrides FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update report user overrides"
  ON public.report_access_user_overrides FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete report user overrides"
  ON public.report_access_user_overrides FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Seed with current hardcoded defaults
INSERT INTO public.report_access_config (report_key, report_name, view_roles, download_roles) VALUES
  ('employee-summary', 'Employee Performance Summary', '{manager,admin,auditor,management}', '{admin}'),
  ('performance', 'Performance Report', '{manager,admin,auditor,management}', '{admin}'),
  ('monthly-scorecard', 'Monthly Scorecard', '{manager,admin,auditor,management}', '{admin}'),
  ('kra-issuance', 'KRA Issuance Report', '{manager,admin,management}', '{admin}'),
  ('queries', 'Query Report', '{manager,admin,auditor,management}', '{admin}'),
  ('issues', 'Unified Issues Report', '{manager,admin,auditor,management}', '{admin}'),
  ('completion', 'Completion Rate Report', '{manager,admin,management}', '{admin}'),
  ('department', 'Department Summary', '{manager,admin,management}', '{admin}'),
  ('audit-trail', 'Audit Trail Report', '{admin,auditor}', '{admin}'),
  ('tni', 'Training Needs (TNI)', '{manager,admin,management}', '{admin}'),
  ('kpi-detail', 'KPI Detail Report', '{manager,admin,auditor,management,hr_pms}', '{admin}'),
  ('bottleneck', 'Workflow Bottleneck Report', '{admin,auditor,management}', '{admin}');
