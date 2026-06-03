CREATE TABLE public.audit_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  module_key text NOT NULL,
  event_category text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  retention_days integer,
  min_severity text NOT NULL DEFAULT 'info',
  include_payload boolean NOT NULL DEFAULT true,
  pii_redaction boolean NOT NULL DEFAULT false,
  alert_on_failure boolean NOT NULL DEFAULT false,
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_by uuid,
  CONSTRAINT audit_policies_unique_key UNIQUE (module_key, event_category),
  CONSTRAINT audit_policies_retention_nonneg CHECK (retention_days IS NULL OR retention_days >= 0),
  CONSTRAINT audit_policies_severity_valid CHECK (min_severity IN ('info','notice','warn','critical'))
);

GRANT SELECT ON public.audit_policies TO authenticated;
GRANT ALL ON public.audit_policies TO service_role;

ALTER TABLE public.audit_policies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "audit_policies_read_authenticated"
  ON public.audit_policies FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "audit_policies_write_platform_owner"
  ON public.audit_policies FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'platform_owner'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'platform_owner'::app_role));

CREATE TRIGGER audit_policies_set_updated_at
  BEFORE UPDATE ON public.audit_policies
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX audit_policies_module_idx ON public.audit_policies(module_key);
CREATE INDEX audit_policies_category_idx ON public.audit_policies(event_category);

-- Seed default matrix. Idempotent: never overwrites user changes.
INSERT INTO public.audit_policies
  (module_key, event_category, enabled, retention_days, min_severity, include_payload, pii_redaction, alert_on_failure)
VALUES
  ('platform',  'auth',              true, 365,  'notice', false, true,  true),
  ('platform',  'permission_change', true, 730,  'warn',   true,  false, true),
  ('platform',  'config_change',     true, 730,  'notice', true,  false, false),
  ('platform',  'admin_action',      true, 730,  'warn',   true,  false, true),
  ('pms',       'score_change',      true, 1825, 'notice', true,  false, false),
  ('pms',       'workflow_change',   true, 1825, 'notice', true,  false, false),
  ('pms',       'data_write',        true, 365,  'info',   true,  true,  false),
  ('pms',       'export',            true, 365,  'warn',   true,  true,  true),
  ('hrms',      'data_write',        true, 730,  'info',   true,  true,  false),
  ('hrms',      'export',            true, 730,  'warn',   true,  true,  true),
  ('safety',    'data_write',        true, 1825, 'notice', true,  false, false),
  ('safety',    'export',            true, 1825, 'warn',   true,  false, true),
  ('incentive', 'score_change',      true, 1825, 'notice', true,  false, false),
  ('incentive', 'data_write',        true, 1825, 'info',   true,  true,  false),
  ('lms',       'data_write',        true, 365,  'info',   true,  true,  false)
ON CONFLICT (module_key, event_category) DO NOTHING;