
CREATE TABLE public.retention_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  module_key text NOT NULL,
  domain_key text NOT NULL,
  domain_label text NOT NULL,
  retention_days integer,
  archive_after_days integer,
  purge_strategy text NOT NULL DEFAULT 'soft_delete',
  legal_hold boolean NOT NULL DEFAULT false,
  regulatory_basis text,
  owner_role text,
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_by uuid,
  CONSTRAINT retention_policies_domain_key_unique UNIQUE (domain_key),
  CONSTRAINT retention_policies_retention_nonneg CHECK (retention_days IS NULL OR retention_days >= 0),
  CONSTRAINT retention_policies_archive_nonneg CHECK (archive_after_days IS NULL OR archive_after_days >= 0),
  CONSTRAINT retention_policies_archive_le_retention CHECK (
    archive_after_days IS NULL OR retention_days IS NULL OR archive_after_days <= retention_days
  ),
  CONSTRAINT retention_policies_strategy_valid CHECK (
    purge_strategy IN ('soft_delete','hard_delete','anonymize','archive_only')
  )
);

GRANT SELECT ON public.retention_policies TO authenticated;
GRANT ALL ON public.retention_policies TO service_role;

ALTER TABLE public.retention_policies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "retention_policies_read_authenticated"
  ON public.retention_policies
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "retention_policies_write_platform_owner"
  ON public.retention_policies
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'platform_owner'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'platform_owner'::app_role));

CREATE INDEX idx_retention_policies_module ON public.retention_policies(module_key);

CREATE TRIGGER trg_retention_policies_updated_at
  BEFORE UPDATE ON public.retention_policies
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.retention_policies
  (module_key, domain_key, domain_label, retention_days, archive_after_days, purge_strategy, legal_hold, regulatory_basis, owner_role)
VALUES
  ('pms',       'pms.review_submissions',     'PMS — Review Submissions',     2555, 730,  'archive_only', true,  'IT/Companies Act 7y',     'hr_pms'),
  ('pms',       'pms.kpi_observations',       'PMS — KPI Observations',       1825, 365,  'soft_delete',  false, NULL,                       'hr_pms'),
  ('pms',       'pms.kpi_queries',            'PMS — KPI Queries',            1825, 365,  'soft_delete',  false, NULL,                       'hr_pms'),
  ('pms',       'pms.audit_logs',             'PMS — Audit Logs',             2555, 1095, 'archive_only', true,  '7y',                       'platform_owner'),
  ('hrms',      'hrms.employee_master',       'HRMS — Employee Master',       NULL, NULL, 'archive_only', true,  'Active employment',        'hr_pms'),
  ('hrms',      'hrms.employment_history',    'HRMS — Employment History',    2555, NULL, 'archive_only', true,  '7y post-exit',             'hr_pms'),
  ('hrms',      'hrms.email_change_audit',    'HRMS — Email Change Audit',    1825, NULL, 'soft_delete',  false, NULL,                       'platform_owner'),
  ('safety',    'safety.incidents',           'Safety — Incidents',           3650, 1825, 'archive_only', true,  'OSHA-equivalent 10y',      'safety_admin'),
  ('safety',    'safety.audit_runs',          'Safety — Audit Runs',          1825, 730,  'archive_only', false, NULL,                       'safety_admin'),
  ('safety',    'safety.permits',             'Safety — Permits',             1095, 365,  'soft_delete',  false, NULL,                       'safety_admin'),
  ('incentive', 'incentive.records',          'Incentive — Records',          2555, 730,  'archive_only', true,  'Payroll 7y',               'hr_pms'),
  ('incentive', 'incentive.eligibility',      'Incentive — Eligibility',      1825, 730,  'soft_delete',  false, NULL,                       'hr_pms'),
  ('platform',  'platform.notifications',     'Platform — Notifications',     180,  90,   'hard_delete',  false, NULL,                       'platform_owner'),
  ('platform',  'platform.email_logs',        'Platform — Email Logs',        365,  180,  'hard_delete',  false, NULL,                       'platform_owner'),
  ('platform',  'platform.entitlement_audit', 'Platform — Entitlement Audit', 2555, 1095, 'archive_only', true,  '7y',                       'platform_owner'),
  ('platform',  'platform.backup_logs',       'Platform — Backup Logs',       730,  365,  'soft_delete',  false, NULL,                       'platform_owner'),
  ('lms',       'lms.training_attempts',      'LMS — Training Attempts',      1825, 730,  'soft_delete',  false, NULL,                       'hr_pms')
ON CONFLICT (domain_key) DO NOTHING;
