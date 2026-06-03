
-- module_registry
CREATE TABLE IF NOT EXISTS public.module_registry (
  module_key text PRIMARY KEY,
  label text NOT NULL,
  description text,
  is_system boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 100,
  client_id uuid NULL,
  entitlement_source text NOT NULL DEFAULT 'db',
  entitlement_version text,
  valid_from timestamptz,
  valid_until timestamptz,
  signature_hash text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.module_registry TO authenticated;
GRANT ALL ON public.module_registry TO service_role;
ALTER TABLE public.module_registry ENABLE ROW LEVEL SECURITY;
CREATE POLICY "module_registry_read" ON public.module_registry FOR SELECT TO authenticated USING (true);
CREATE POLICY "module_registry_write" ON public.module_registry FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'platform_owner'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'platform_owner'::public.app_role));

-- action_registry
CREATE TABLE IF NOT EXISTS public.action_registry (
  action_key text PRIMARY KEY,
  module_key text NOT NULL REFERENCES public.module_registry(module_key),
  label text NOT NULL,
  description text,
  risk_level text NOT NULL DEFAULT 'low' CHECK (risk_level IN ('low','medium','high','critical')),
  is_system boolean NOT NULL DEFAULT false,
  client_id uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_action_registry_module ON public.action_registry(module_key);
GRANT SELECT ON public.action_registry TO authenticated;
GRANT ALL ON public.action_registry TO service_role;
ALTER TABLE public.action_registry ENABLE ROW LEVEL SECURITY;
CREATE POLICY "action_registry_read" ON public.action_registry FOR SELECT TO authenticated USING (true);
CREATE POLICY "action_registry_write" ON public.action_registry FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'platform_owner'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'platform_owner'::public.app_role));

-- capability_registry
CREATE TABLE IF NOT EXISTS public.capability_registry (
  capability_key text PRIMARY KEY,
  module_key text NOT NULL REFERENCES public.module_registry(module_key),
  label text NOT NULL,
  description text,
  client_id uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.capability_registry TO authenticated;
GRANT ALL ON public.capability_registry TO service_role;
ALTER TABLE public.capability_registry ENABLE ROW LEVEL SECURITY;
CREATE POLICY "capability_registry_read" ON public.capability_registry FOR SELECT TO authenticated USING (true);
CREATE POLICY "capability_registry_write" ON public.capability_registry FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'platform_owner'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'platform_owner'::public.app_role));

-- Stub registries
CREATE TABLE IF NOT EXISTS public.dashboard_registry (
  dashboard_key text PRIMARY KEY,
  module_key text NOT NULL REFERENCES public.module_registry(module_key),
  label text NOT NULL,
  client_id uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.dashboard_registry TO authenticated;
GRANT ALL ON public.dashboard_registry TO service_role;
ALTER TABLE public.dashboard_registry ENABLE ROW LEVEL SECURITY;
CREATE POLICY "dashboard_registry_read" ON public.dashboard_registry FOR SELECT TO authenticated USING (true);
CREATE POLICY "dashboard_registry_write" ON public.dashboard_registry FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'platform_owner'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'platform_owner'::public.app_role));

CREATE TABLE IF NOT EXISTS public.report_registry_v2 (
  report_key text PRIMARY KEY,
  module_key text NOT NULL REFERENCES public.module_registry(module_key),
  label text NOT NULL,
  client_id uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.report_registry_v2 TO authenticated;
GRANT ALL ON public.report_registry_v2 TO service_role;
ALTER TABLE public.report_registry_v2 ENABLE ROW LEVEL SECURITY;
CREATE POLICY "report_registry_v2_read" ON public.report_registry_v2 FOR SELECT TO authenticated USING (true);
CREATE POLICY "report_registry_v2_write" ON public.report_registry_v2 FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'platform_owner'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'platform_owner'::public.app_role));

CREATE TABLE IF NOT EXISTS public.notification_event_registry (
  event_key text PRIMARY KEY,
  module_key text NOT NULL REFERENCES public.module_registry(module_key),
  label text NOT NULL,
  client_id uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.notification_event_registry TO authenticated;
GRANT ALL ON public.notification_event_registry TO service_role;
ALTER TABLE public.notification_event_registry ENABLE ROW LEVEL SECURITY;
CREATE POLICY "notification_event_registry_read" ON public.notification_event_registry FOR SELECT TO authenticated USING (true);
CREATE POLICY "notification_event_registry_write" ON public.notification_event_registry FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'platform_owner'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'platform_owner'::public.app_role));

CREATE TABLE IF NOT EXISTS public.ai_feature_registry (
  feature_key text PRIMARY KEY,
  module_key text NOT NULL REFERENCES public.module_registry(module_key),
  label text NOT NULL,
  client_id uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.ai_feature_registry TO authenticated;
GRANT ALL ON public.ai_feature_registry TO service_role;
ALTER TABLE public.ai_feature_registry ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ai_feature_registry_read" ON public.ai_feature_registry FOR SELECT TO authenticated USING (true);
CREATE POLICY "ai_feature_registry_write" ON public.ai_feature_registry FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'platform_owner'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'platform_owner'::public.app_role));

CREATE TABLE IF NOT EXISTS public.integration_connector_registry (
  connector_key text PRIMARY KEY,
  module_key text NOT NULL REFERENCES public.module_registry(module_key),
  label text NOT NULL,
  client_id uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.integration_connector_registry TO authenticated;
GRANT ALL ON public.integration_connector_registry TO service_role;
ALTER TABLE public.integration_connector_registry ENABLE ROW LEVEL SECURITY;
CREATE POLICY "integration_connector_registry_read" ON public.integration_connector_registry FOR SELECT TO authenticated USING (true);
CREATE POLICY "integration_connector_registry_write" ON public.integration_connector_registry FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'platform_owner'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'platform_owner'::public.app_role));

-- clients
CREATE TABLE IF NOT EXISTS public.clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_key text NOT NULL UNIQUE,
  display_name text NOT NULL,
  deployment_mode text NOT NULL DEFAULT 'saas' CHECK (deployment_mode IN ('saas','on_prem','hybrid')),
  is_active boolean NOT NULL DEFAULT true,
  entitlement_source text NOT NULL DEFAULT 'db',
  entitlement_version text,
  valid_from timestamptz,
  valid_until timestamptz,
  signature_hash text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.clients TO authenticated;
GRANT ALL ON public.clients TO service_role;
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "clients_read" ON public.clients FOR SELECT TO authenticated USING (true);
CREATE POLICY "clients_write" ON public.clients FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'platform_owner'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'platform_owner'::public.app_role));

-- client_module_entitlements
CREATE TABLE IF NOT EXISTS public.client_module_entitlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  module_key text NOT NULL REFERENCES public.module_registry(module_key),
  is_enabled boolean NOT NULL DEFAULT true,
  valid_from timestamptz,
  valid_until timestamptz,
  granted_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_id, module_key)
);
CREATE INDEX IF NOT EXISTS idx_cme_client ON public.client_module_entitlements(client_id);
GRANT SELECT ON public.client_module_entitlements TO authenticated;
GRANT ALL ON public.client_module_entitlements TO service_role;
ALTER TABLE public.client_module_entitlements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cme_read" ON public.client_module_entitlements FOR SELECT TO authenticated USING (true);
CREATE POLICY "cme_write" ON public.client_module_entitlements FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'platform_owner'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'platform_owner'::public.app_role));

-- client_action_entitlements
CREATE TABLE IF NOT EXISTS public.client_action_entitlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  action_key text NOT NULL REFERENCES public.action_registry(action_key),
  is_enabled boolean NOT NULL DEFAULT true,
  valid_from timestamptz,
  valid_until timestamptz,
  granted_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_id, action_key)
);
CREATE INDEX IF NOT EXISTS idx_cae_client ON public.client_action_entitlements(client_id);
GRANT SELECT ON public.client_action_entitlements TO authenticated;
GRANT ALL ON public.client_action_entitlements TO service_role;
ALTER TABLE public.client_action_entitlements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cae_read" ON public.client_action_entitlements FOR SELECT TO authenticated USING (true);
CREATE POLICY "cae_write" ON public.client_action_entitlements FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'platform_owner'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'platform_owner'::public.app_role));

-- entitlement_audit (append-only)
CREATE TABLE IF NOT EXISTS public.entitlement_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid,
  event_type text NOT NULL CHECK (event_type IN ('grant','revoke','update','would_deny','admin_view')),
  entity_type text NOT NULL,
  entity_key text NOT NULL,
  client_id uuid,
  before jsonb,
  after jsonb,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ent_audit_created ON public.entitlement_audit(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ent_audit_event ON public.entitlement_audit(event_type);
GRANT SELECT, INSERT ON public.entitlement_audit TO authenticated;
GRANT ALL ON public.entitlement_audit TO service_role;
ALTER TABLE public.entitlement_audit ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ent_audit_insert" ON public.entitlement_audit FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "ent_audit_read" ON public.entitlement_audit FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'platform_owner'::public.app_role));

-- Touch trigger
CREATE OR REPLACE FUNCTION public.touch_updated_at_hub()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER module_registry_touch BEFORE UPDATE ON public.module_registry
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at_hub();
CREATE TRIGGER action_registry_touch BEFORE UPDATE ON public.action_registry
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at_hub();
CREATE TRIGGER clients_touch BEFORE UPDATE ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at_hub();
CREATE TRIGGER cme_touch BEFORE UPDATE ON public.client_module_entitlements
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at_hub();
CREATE TRIGGER cae_touch BEFORE UPDATE ON public.client_action_entitlements
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at_hub();

-- SEEDS
INSERT INTO public.module_registry (module_key, label, description, is_system, sort_order)
VALUES ('pms', 'Performance Management System', 'Existing live PMS module', true, 10)
ON CONFLICT (module_key) DO NOTHING;

INSERT INTO public.action_registry (action_key, module_key, label, risk_level, is_system) VALUES
  ('pms.admin.users.add',                'pms', 'Add User',                   'high',     true),
  ('pms.admin.users.edit',               'pms', 'Edit User',                  'high',     true),
  ('pms.admin.users.manage_access',      'pms', 'Manage User Access',         'high',     true),
  ('pms.admin.users.password_rollout',   'pms', 'Password Rollout',           'critical', true),
  ('pms.admin.users.working_days',       'pms', 'Edit Working Days',          'medium',   true),
  ('pms.admin.kra.assign',               'pms', 'Assign KRA',                 'high',     true),
  ('pms.workflow.final_score_rules.edit','pms', 'Edit Final Score Rule',      'critical', true),
  ('pms.workflow.template.edit',         'pms', 'Edit Workflow Template',     'high',     true),
  ('pms.menu.create_tab',                'pms', 'Create Custom Menu Tab',     'medium',   true),
  ('pms.menu.delete_custom_tab',         'pms', 'Delete Custom Menu Tab',     'high',     true),
  ('pms.reports.performance.export',     'pms', 'Export Performance Report',  'medium',   true),
  ('pms.data.import',                    'pms', 'Import Data',                'high',     true),
  ('pms.data.export',                    'pms', 'Export Data',                'medium',   true)
ON CONFLICT (action_key) DO NOTHING;

INSERT INTO public.capability_registry (capability_key, module_key, label, description) VALUES
  ('pms.role.admin',       'pms', 'Admin',           'Full PMS administration'),
  ('pms.role.manager',     'pms', 'Manager',         'Reviews direct reports'),
  ('pms.role.employee',    'pms', 'Employee',        'Submits self-reviews'),
  ('pms.role.auditor',     'pms', 'Auditor',         'Audits PMS submissions'),
  ('pms.role.management',  'pms', 'Management',      'Senior management view'),
  ('pms.role.hr_pms',      'pms', 'HR PMS',          'HR-level PMS calibration'),
  ('pms.role.skip_level',  'pms', 'Skip-Level',      'Skip-level reviewer')
ON CONFLICT (capability_key) DO NOTHING;

INSERT INTO public.clients (client_key, display_name, deployment_mode, entitlement_source)
VALUES ('default', 'Default Deployment', 'saas', 'db')
ON CONFLICT (client_key) DO NOTHING;

INSERT INTO public.client_module_entitlements (client_id, module_key, is_enabled)
SELECT c.id, 'pms', true FROM public.clients c WHERE c.client_key = 'default'
ON CONFLICT (client_id, module_key) DO NOTHING;

INSERT INTO public.client_action_entitlements (client_id, action_key, is_enabled)
SELECT c.id, a.action_key, true
FROM public.clients c
CROSS JOIN public.action_registry a
WHERE c.client_key = 'default' AND a.module_key = 'pms'
ON CONFLICT (client_id, action_key) DO NOTHING;
