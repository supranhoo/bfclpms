-- =====================================================================
-- IAC Phase 1: Identity & Access Console foundation (ADDITIVE ONLY)
-- =====================================================================

-- 1. Capability catalog -------------------------------------------------
CREATE TABLE IF NOT EXISTS public.iac_capabilities (
  code            text PRIMARY KEY,
  module          text NOT NULL,
  label           text NOT NULL,
  description     text,
  is_destructive  boolean NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS iac_capabilities_module_idx ON public.iac_capabilities(module);

-- 2. Roles (bundles of capabilities) ------------------------------------
CREATE TABLE IF NOT EXISTS public.iac_roles (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code         text NOT NULL UNIQUE,
  name         text NOT NULL,
  module       text NOT NULL,
  description  text,
  is_system    boolean NOT NULL DEFAULT false,
  is_active    boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS iac_roles_module_idx ON public.iac_roles(module);

-- 3. Role <-> Capability mapping ----------------------------------------
CREATE TABLE IF NOT EXISTS public.iac_role_capabilities (
  role_id          uuid NOT NULL REFERENCES public.iac_roles(id) ON DELETE CASCADE,
  capability_code  text NOT NULL REFERENCES public.iac_capabilities(code) ON DELETE CASCADE,
  PRIMARY KEY (role_id, capability_code)
);

-- 4. User assignments (with scope) --------------------------------------
DO $$ BEGIN
  CREATE TYPE public.iac_scope_type AS ENUM ('global','company','business_unit','department');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.iac_user_role_assignments (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role_id       uuid NOT NULL REFERENCES public.iac_roles(id) ON DELETE CASCADE,
  scope_type    public.iac_scope_type NOT NULL DEFAULT 'global',
  scope_id      uuid,
  assigned_by   uuid REFERENCES auth.users(id),
  assigned_at   timestamptz NOT NULL DEFAULT now(),
  expires_at    timestamptz,
  CONSTRAINT iac_assignment_uniq UNIQUE (user_id, role_id, scope_type, scope_id)
);
CREATE INDEX IF NOT EXISTS iac_user_role_assignments_user_idx ON public.iac_user_role_assignments(user_id);
CREATE INDEX IF NOT EXISTS iac_user_role_assignments_role_idx ON public.iac_user_role_assignments(role_id);

-- 5. Audit log ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.iac_audit_log (
  id          bigserial PRIMARY KEY,
  actor_id    uuid,
  action      text NOT NULL,
  target_type text NOT NULL,
  target_id   text,
  payload     jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS iac_audit_log_created_idx ON public.iac_audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS iac_audit_log_target_idx  ON public.iac_audit_log(target_type, target_id);

-- 6. has_capability ------------------------------------------------------
CREATE OR REPLACE FUNCTION public.has_capability(
  _user_id    uuid,
  _capability text,
  _scope_type public.iac_scope_type DEFAULT 'global',
  _scope_id   uuid DEFAULT NULL
) RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.iac_user_role_assignments ura
    JOIN public.iac_role_capabilities rc ON rc.role_id = ura.role_id
    JOIN public.iac_roles r              ON r.id = ura.role_id
    WHERE ura.user_id = _user_id
      AND r.is_active = true
      AND (ura.expires_at IS NULL OR ura.expires_at > now())
      AND rc.capability_code = _capability
      AND (
        ura.scope_type = 'global'
        OR (ura.scope_type = _scope_type AND ura.scope_id IS NOT DISTINCT FROM _scope_id)
      )
  );
$$;

-- 7. updated_at trigger for roles ---------------------------------------
CREATE OR REPLACE FUNCTION public.iac_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS iac_roles_touch ON public.iac_roles;
CREATE TRIGGER iac_roles_touch
  BEFORE UPDATE ON public.iac_roles
  FOR EACH ROW EXECUTE FUNCTION public.iac_touch_updated_at();

-- 8. Enable RLS ----------------------------------------------------------
ALTER TABLE public.iac_capabilities          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.iac_roles                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.iac_role_capabilities     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.iac_user_role_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.iac_audit_log             ENABLE ROW LEVEL SECURITY;

-- Catalog: readable by all authenticated; admin writes
CREATE POLICY "iac_capabilities_read"  ON public.iac_capabilities FOR SELECT TO authenticated USING (true);
CREATE POLICY "iac_capabilities_admin" ON public.iac_capabilities FOR ALL    TO authenticated USING (public.has_role(auth.uid(),'admin'::app_role)) WITH CHECK (public.has_role(auth.uid(),'admin'::app_role));

-- Roles: read active to all auth; admin writes
CREATE POLICY "iac_roles_read"  ON public.iac_roles FOR SELECT TO authenticated USING (is_active OR public.has_role(auth.uid(),'admin'::app_role));
CREATE POLICY "iac_roles_admin" ON public.iac_roles FOR ALL    TO authenticated USING (public.has_role(auth.uid(),'admin'::app_role)) WITH CHECK (public.has_role(auth.uid(),'admin'::app_role));

-- Role-capabilities: read to all auth; admin writes
CREATE POLICY "iac_rc_read"  ON public.iac_role_capabilities FOR SELECT TO authenticated USING (true);
CREATE POLICY "iac_rc_admin" ON public.iac_role_capabilities FOR ALL    TO authenticated USING (public.has_role(auth.uid(),'admin'::app_role)) WITH CHECK (public.has_role(auth.uid(),'admin'::app_role));

-- Assignments: user sees own; admin sees/manages all
CREATE POLICY "iac_assign_self"  ON public.iac_user_role_assignments FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "iac_assign_admin_read" ON public.iac_user_role_assignments FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'::app_role));
CREATE POLICY "iac_assign_admin_write" ON public.iac_user_role_assignments FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin'::app_role)) WITH CHECK (public.has_role(auth.uid(),'admin'::app_role));

-- Audit: admin reads only; inserts via SECURITY DEFINER function
CREATE POLICY "iac_audit_read" ON public.iac_audit_log FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'::app_role));

-- 9. Seed capabilities ---------------------------------------------------
INSERT INTO public.iac_capabilities (code, module, label, description, is_destructive) VALUES
  -- Hub / cross-cutting
  ('hub.access',                  'hub',    'Access Hub',                    'Sign in to the module hub.', false),
  ('hub.iac.manage',              'hub',    'Manage Identity & Access',      'Full IAC console: roles, capabilities, assignments, audit.', true),
  -- PMS
  ('pms.access',                  'pms',    'Access PMS module',             'Open the PMS module.', false),
  ('pms.review.self_submit',      'pms',    'Submit self-review',            'Submit own performance review.', false),
  ('pms.review.manager',          'pms',    'Manager review',                'Review direct reports.', false),
  ('pms.review.skip_level',       'pms',    'Skip-level review',             'Review skip-level reports.', false),
  ('pms.review.audit',            'pms',    'Audit reviews',                 'Audit submitted reviews.', false),
  ('pms.review.management',       'pms',    'Management approval',           'Final approval on reviews.', true),
  ('pms.review.hr',               'pms',    'HR PMS operations',             'HR oversight on PMS.', true),
  ('pms.admin',                   'pms',    'PMS administration',            'Configure PMS: KPIs, periods, workflows.', true),
  -- Safety
  ('safety.access',               'safety', 'Access Safety module',          'Open the Safety module.', false),
  ('safety.incident.create',      'safety', 'Report incident',               'Create new incidents.', false),
  ('safety.incident.investigate', 'safety', 'Investigate incident',          'Triage and investigate incidents.', false),
  ('safety.incident.approve',     'safety', 'Approve incident closure',      'Close approved incidents.', true),
  ('safety.permit.request',       'safety', 'Request permit',                'Submit permit-to-work requests.', false),
  ('safety.permit.approve',       'safety', 'Approve permit',                'Approve permit-to-work requests.', true),
  ('safety.audit.run',            'safety', 'Run safety audit',              'Execute audit templates.', false),
  ('safety.audit.read',           'safety', 'Read audit logs',               'Read-only audit log access.', false),
  ('safety.training.deliver',     'safety', 'Deliver safety training',       'Manage and deliver training.', false),
  ('safety.admin',                'safety', 'Safety administration',         'Configure Safety: templates, BUs, users.', true)
ON CONFLICT (code) DO NOTHING;

-- 10. Seed roles + role->capability mapping (parity with current enums) -
-- Helper inline blocks instead of repeating WITH/JOIN
INSERT INTO public.iac_roles (code, name, module, description, is_system, is_active) VALUES
  -- PMS
  ('pms_admin',       'PMS Admin',          'pms',    'Full PMS configuration and oversight.', true, true),
  ('pms_manager',     'Manager',            'pms',    'Reviews direct reports.',                true, true),
  ('pms_employee',    'Employee',           'pms',    'Submits self-review.',                   true, true),
  ('pms_auditor',     'Auditor',            'pms',    'Audits submitted reviews.',              true, true),
  ('pms_management',  'Management',         'pms',    'Final approver on reviews.',             true, true),
  ('pms_hr',          'HR (PMS)',           'pms',    'HR operations within PMS.',              true, true),
  ('pms_skip_level',  'Skip-level Reviewer','pms',    'Skip-level approvals.',                  true, true),
  -- Safety
  ('safety_admin',    'Safety Admin',       'safety', 'Full Safety configuration.',             true, true),
  ('safety_head',     'Safety Head',        'safety', 'Module-wide oversight, closure approvals.', true, true),
  ('safety_officer',  'Safety Officer',     'safety', 'Triages incidents and runs investigations.', true, true),
  ('safety_bu_head',  'BU Head',            'safety', 'Approves incidents within their BU.',    true, true),
  ('safety_manager',  'Safety Manager',     'safety', 'Departmental safety oversight.',         true, true),
  ('safety_supervisor','Safety Supervisor', 'safety', 'On-floor first responder.',              true, true),
  ('safety_worker',   'Worker',             'safety', 'Reports incidents and acts on assignments.', true, true),
  ('safety_auditor',  'Safety Auditor',     'safety', 'Read-only audit access.',                true, true)
ON CONFLICT (code) DO NOTHING;

-- Map: PMS Admin -> all PMS + hub.iac.manage
INSERT INTO public.iac_role_capabilities (role_id, capability_code)
SELECT r.id, c.code
FROM public.iac_roles r, public.iac_capabilities c
WHERE r.code = 'pms_admin'
  AND (c.module = 'pms' OR c.code IN ('hub.access','hub.iac.manage','safety.access'))
ON CONFLICT DO NOTHING;

INSERT INTO public.iac_role_capabilities (role_id, capability_code)
SELECT r.id, c.code FROM public.iac_roles r, public.iac_capabilities c
WHERE r.code='pms_manager' AND c.code IN ('hub.access','pms.access','pms.review.manager','pms.review.self_submit')
ON CONFLICT DO NOTHING;

INSERT INTO public.iac_role_capabilities (role_id, capability_code)
SELECT r.id, c.code FROM public.iac_roles r, public.iac_capabilities c
WHERE r.code='pms_employee' AND c.code IN ('hub.access','pms.access','pms.review.self_submit')
ON CONFLICT DO NOTHING;

INSERT INTO public.iac_role_capabilities (role_id, capability_code)
SELECT r.id, c.code FROM public.iac_roles r, public.iac_capabilities c
WHERE r.code='pms_auditor' AND c.code IN ('hub.access','pms.access','pms.review.audit')
ON CONFLICT DO NOTHING;

INSERT INTO public.iac_role_capabilities (role_id, capability_code)
SELECT r.id, c.code FROM public.iac_roles r, public.iac_capabilities c
WHERE r.code='pms_management' AND c.code IN ('hub.access','pms.access','pms.review.management')
ON CONFLICT DO NOTHING;

INSERT INTO public.iac_role_capabilities (role_id, capability_code)
SELECT r.id, c.code FROM public.iac_roles r, public.iac_capabilities c
WHERE r.code='pms_hr' AND c.code IN ('hub.access','pms.access','pms.review.hr')
ON CONFLICT DO NOTHING;

INSERT INTO public.iac_role_capabilities (role_id, capability_code)
SELECT r.id, c.code FROM public.iac_roles r, public.iac_capabilities c
WHERE r.code='pms_skip_level' AND c.code IN ('hub.access','pms.access','pms.review.skip_level')
ON CONFLICT DO NOTHING;

-- Map: Safety roles
INSERT INTO public.iac_role_capabilities (role_id, capability_code)
SELECT r.id, c.code FROM public.iac_roles r, public.iac_capabilities c
WHERE r.code='safety_admin' AND (c.module='safety' OR c.code='hub.access')
ON CONFLICT DO NOTHING;

INSERT INTO public.iac_role_capabilities (role_id, capability_code)
SELECT r.id, c.code FROM public.iac_roles r, public.iac_capabilities c
WHERE r.code='safety_head'
  AND c.code IN ('hub.access','safety.access','safety.incident.investigate','safety.incident.approve','safety.permit.approve','safety.audit.read')
ON CONFLICT DO NOTHING;

INSERT INTO public.iac_role_capabilities (role_id, capability_code)
SELECT r.id, c.code FROM public.iac_roles r, public.iac_capabilities c
WHERE r.code='safety_officer'
  AND c.code IN ('hub.access','safety.access','safety.incident.create','safety.incident.investigate','safety.permit.request','safety.audit.run')
ON CONFLICT DO NOTHING;

INSERT INTO public.iac_role_capabilities (role_id, capability_code)
SELECT r.id, c.code FROM public.iac_roles r, public.iac_capabilities c
WHERE r.code='safety_bu_head'
  AND c.code IN ('hub.access','safety.access','safety.incident.approve','safety.permit.approve')
ON CONFLICT DO NOTHING;

INSERT INTO public.iac_role_capabilities (role_id, capability_code)
SELECT r.id, c.code FROM public.iac_roles r, public.iac_capabilities c
WHERE r.code='safety_manager'
  AND c.code IN ('hub.access','safety.access','safety.incident.investigate','safety.permit.request')
ON CONFLICT DO NOTHING;

INSERT INTO public.iac_role_capabilities (role_id, capability_code)
SELECT r.id, c.code FROM public.iac_roles r, public.iac_capabilities c
WHERE r.code='safety_supervisor'
  AND c.code IN ('hub.access','safety.access','safety.incident.create','safety.permit.request')
ON CONFLICT DO NOTHING;

INSERT INTO public.iac_role_capabilities (role_id, capability_code)
SELECT r.id, c.code FROM public.iac_roles r, public.iac_capabilities c
WHERE r.code='safety_worker'
  AND c.code IN ('hub.access','safety.access','safety.incident.create')
ON CONFLICT DO NOTHING;

INSERT INTO public.iac_role_capabilities (role_id, capability_code)
SELECT r.id, c.code FROM public.iac_roles r, public.iac_capabilities c
WHERE r.code='safety_auditor'
  AND c.code IN ('hub.access','safety.access','safety.audit.read')
ON CONFLICT DO NOTHING;

-- 11. Backfill assignments from existing tables -------------------------
-- PMS user_roles (app_role enum) -> iac_user_role_assignments
INSERT INTO public.iac_user_role_assignments (user_id, role_id, scope_type, scope_id, assigned_by, assigned_at)
SELECT ur.user_id, r.id, 'global'::iac_scope_type, NULL, NULL, now()
FROM public.user_roles ur
JOIN public.iac_roles r ON r.code = CASE ur.role::text
  WHEN 'admin'      THEN 'pms_admin'
  WHEN 'manager'    THEN 'pms_manager'
  WHEN 'employee'   THEN 'pms_employee'
  WHEN 'auditor'    THEN 'pms_auditor'
  WHEN 'management' THEN 'pms_management'
  WHEN 'hr_pms'     THEN 'pms_hr'
  WHEN 'skip_level' THEN 'pms_skip_level'
END
ON CONFLICT DO NOTHING;

-- Safety roles -> iac assignments (preserve BU scope when present)
INSERT INTO public.iac_user_role_assignments (user_id, role_id, scope_type, scope_id, assigned_by, assigned_at)
SELECT
  sur.user_id,
  r.id,
  CASE WHEN sur.business_unit_id IS NOT NULL THEN 'business_unit'::iac_scope_type ELSE 'global'::iac_scope_type END,
  sur.business_unit_id,
  sur.assigned_by,
  sur.assigned_at
FROM public.safety_user_roles sur
JOIN public.iac_roles r ON r.code = CASE sur.role::text
  WHEN 'admin'          THEN 'safety_admin'
  WHEN 'safety_head'    THEN 'safety_head'
  WHEN 'safety_officer' THEN 'safety_officer'
  WHEN 'bu_head'        THEN 'safety_bu_head'
  WHEN 'manager'        THEN 'safety_manager'
  WHEN 'supervisor'     THEN 'safety_supervisor'
  WHEN 'worker'         THEN 'safety_worker'
  WHEN 'auditor'        THEN 'safety_auditor'
END
ON CONFLICT DO NOTHING;

-- 12. Audit logger function (used by app + future triggers) -------------
CREATE OR REPLACE FUNCTION public.iac_log(
  _action      text,
  _target_type text,
  _target_id   text,
  _payload     jsonb DEFAULT '{}'::jsonb
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.iac_audit_log (actor_id, action, target_type, target_id, payload)
  VALUES (auth.uid(), _action, _target_type, _target_id, COALESCE(_payload,'{}'::jsonb));
END $$;
