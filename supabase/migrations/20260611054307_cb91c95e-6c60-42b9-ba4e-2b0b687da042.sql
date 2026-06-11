
CREATE TABLE IF NOT EXISTS public.safety_permission_keys (
  key text PRIMARY KEY,
  category text NOT NULL CHECK (category IN ('nav','action','widget')),
  label text NOT NULL,
  description text,
  sort_order int NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.safety_permission_keys TO authenticated;
GRANT ALL ON public.safety_permission_keys TO service_role;
ALTER TABLE public.safety_permission_keys ENABLE ROW LEVEL SECURITY;
CREATE POLICY "spk_read"  ON public.safety_permission_keys FOR SELECT TO authenticated USING (true);
CREATE POLICY "spk_write" ON public.safety_permission_keys FOR ALL TO authenticated
  USING (public.has_safety_role(auth.uid(),'admin'))
  WITH CHECK (public.has_safety_role(auth.uid(),'admin'));

CREATE TABLE IF NOT EXISTS public.safety_role_permissions (
  role public.safety_app_role NOT NULL,
  permission_key text NOT NULL REFERENCES public.safety_permission_keys(key) ON DELETE CASCADE,
  is_allowed boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id),
  PRIMARY KEY (role, permission_key)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.safety_role_permissions TO authenticated;
GRANT ALL ON public.safety_role_permissions TO service_role;
ALTER TABLE public.safety_role_permissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "srp_read"  ON public.safety_role_permissions FOR SELECT TO authenticated USING (true);
CREATE POLICY "srp_write" ON public.safety_role_permissions FOR ALL TO authenticated
  USING (public.has_safety_role(auth.uid(),'admin'))
  WITH CHECK (public.has_safety_role(auth.uid(),'admin'));

CREATE TABLE IF NOT EXISTS public.safety_user_permission_overrides (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  permission_key text NOT NULL REFERENCES public.safety_permission_keys(key) ON DELETE CASCADE,
  effect text NOT NULL CHECK (effect IN ('allow','deny')),
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  PRIMARY KEY (user_id, permission_key)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.safety_user_permission_overrides TO authenticated;
GRANT ALL ON public.safety_user_permission_overrides TO service_role;
ALTER TABLE public.safety_user_permission_overrides ENABLE ROW LEVEL SECURITY;
CREATE POLICY "supo_read"  ON public.safety_user_permission_overrides FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_safety_role(auth.uid(),'admin'));
CREATE POLICY "supo_write" ON public.safety_user_permission_overrides FOR ALL TO authenticated
  USING (public.has_safety_role(auth.uid(),'admin'))
  WITH CHECK (public.has_safety_role(auth.uid(),'admin'));

CREATE OR REPLACE FUNCTION public.has_safety_permission(_user_id uuid, _key text)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_override text; v_role_allow boolean;
BEGIN
  IF _user_id IS NULL OR _key IS NULL THEN RETURN false; END IF;
  IF public.has_safety_role(_user_id,'admin') THEN RETURN true; END IF;
  SELECT effect INTO v_override FROM public.safety_user_permission_overrides
   WHERE user_id=_user_id AND permission_key=_key;
  IF v_override='deny' THEN RETURN false; END IF;
  IF v_override='allow' THEN RETURN true; END IF;
  SELECT bool_or(COALESCE(rp.is_allowed,true)) INTO v_role_allow
    FROM public.safety_user_roles ur
    LEFT JOIN public.safety_role_permissions rp
      ON rp.role=ur.role AND rp.permission_key=_key
   WHERE ur.user_id=_user_id;
  IF v_role_allow IS NULL THEN RETURN (_key='nav.home'); END IF;
  RETURN v_role_allow;
END$$;

CREATE OR REPLACE FUNCTION public.get_safety_permissions(_user_id uuid)
RETURNS TABLE (permission_key text, allowed boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY SELECT pk.key, public.has_safety_permission(_user_id, pk.key)
    FROM public.safety_permission_keys pk WHERE pk.is_active=true;
END$$;

GRANT EXECUTE ON FUNCTION public.has_safety_permission(uuid,text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_safety_permissions(uuid)      TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.safety_permissions_audit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.safety_audit_log (event_type, entity_type, performed_by, details)
  VALUES (
    TG_OP, TG_TABLE_NAME, auth.uid(),
    jsonb_build_object(
      'permission_key', COALESCE(NEW.permission_key, OLD.permission_key),
      'old', to_jsonb(OLD), 'new', to_jsonb(NEW)
    )
  );
  RETURN COALESCE(NEW, OLD);
END$$;

DROP TRIGGER IF EXISTS trg_audit_safety_role_permissions ON public.safety_role_permissions;
CREATE TRIGGER trg_audit_safety_role_permissions
  AFTER INSERT OR UPDATE OR DELETE ON public.safety_role_permissions
  FOR EACH ROW EXECUTE FUNCTION public.safety_permissions_audit();

DROP TRIGGER IF EXISTS trg_audit_safety_user_overrides ON public.safety_user_permission_overrides;
CREATE TRIGGER trg_audit_safety_user_overrides
  AFTER INSERT OR UPDATE OR DELETE ON public.safety_user_permission_overrides
  FOR EACH ROW EXECUTE FUNCTION public.safety_permissions_audit();

INSERT INTO public.safety_permission_keys (key, category, label, sort_order) VALUES
  ('nav.home','nav','Safety Home',10),
  ('nav.incidents','nav','Incidents',20),
  ('nav.permits','nav','Permits to Work',30),
  ('nav.assets','nav','Assets & Calibration',40),
  ('nav.audits','nav','Audits & Compliance',50),
  ('nav.emergency','nav','Emergency Response',60),
  ('nav.training_my','nav','My Training',70),
  ('nav.training_admin','nav','Training Admin',80),
  ('nav.analytics','nav','Analytics',90),
  ('nav.hours_worked','nav','Hours Worked',100),
  ('nav.permit_types','nav','Permit Types Config',110),
  ('nav.sla_monitor','nav','SLA Monitor',120),
  ('nav.users_roles','nav','Users & Roles',130),
  ('nav.audit_log','nav','Audit Log',140),
  ('action.incidents.view','action','View Incidents',200),
  ('action.incidents.create','action','Create Incident',201),
  ('action.incidents.edit','action','Edit Incident',202),
  ('action.incidents.assign','action','Assign Incident',203),
  ('action.incidents.investigate','action','Investigate Incident',204),
  ('action.incidents.approve','action','Approve Incident',205),
  ('action.incidents.close','action','Close Incident',206),
  ('action.incidents.delete','action','Delete Incident',207),
  ('action.permits.view','action','View Permits',210),
  ('action.permits.create','action','Create Permit',211),
  ('action.permits.approve','action','Approve Permit',212),
  ('action.permits.reject','action','Reject Permit',213),
  ('action.permits.close','action','Close Permit',214),
  ('action.assets.view','action','View Assets',220),
  ('action.assets.create','action','Create Asset',221),
  ('action.assets.edit','action','Edit Asset',222),
  ('action.assets.calibrate','action','Calibrate Asset',223),
  ('action.assets.archive','action','Archive Asset',224),
  ('action.audits.view','action','View Audits',230),
  ('action.audits.create','action','Create Audit',231),
  ('action.audits.execute','action','Execute Audit',232),
  ('action.audits.close','action','Close Audit',233),
  ('action.training.view','action','View Training',240),
  ('action.training.assign','action','Assign Training',241),
  ('action.training.complete','action','Complete Training',242),
  ('action.training.administer','action','Administer Training',243),
  ('action.emergency.view','action','View Emergency Tools',250),
  ('action.emergency.trigger','action','Trigger Emergency',251),
  ('action.emergency.resolve','action','Resolve Emergency',252),
  ('action.users.view','action','View Users',260),
  ('action.users.create','action','Create User',261),
  ('action.users.edit','action','Edit User',262),
  ('action.users.delete','action','Delete User',263),
  ('action.users.manage_permissions','action','Manage Permissions',264),
  ('widget.open_incidents','widget','Open Incidents',300),
  ('widget.overdue_incidents','widget','Overdue Incidents',301),
  ('widget.at_risk','widget','At-Risk Incidents',302),
  ('widget.orphaned','widget','Orphaned Incidents',303),
  ('widget.closed','widget','Closed Incidents',304),
  ('widget.my_assignments','widget','My Assignments',305),
  ('widget.trend_30d','widget','30-Day Trend',306),
  ('widget.stage_dist','widget','Stage Distribution',307),
  ('widget.severity_dist','widget','Severity Distribution',308),
  ('widget.sla','widget','SLA Metrics',309),
  ('widget.compliance','widget','Compliance Metrics',310),
  ('widget.training','widget','Training Metrics',311),
  ('widget.audit','widget','Audit Metrics',312),
  ('widget.asset','widget','Asset Metrics',313)
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.safety_role_permissions (role, permission_key, is_allowed) VALUES
  ('worker','nav.users_roles',false),('supervisor','nav.users_roles',false),('manager','nav.users_roles',false),('bu_head','nav.users_roles',false),('safety_officer','nav.users_roles',false),('auditor','nav.users_roles',false),
  ('worker','nav.audit_log',false),('supervisor','nav.audit_log',false),('manager','nav.audit_log',false),('bu_head','nav.audit_log',false),('safety_officer','nav.audit_log',false),('auditor','nav.audit_log',false),
  ('worker','nav.permit_types',false),('supervisor','nav.permit_types',false),('manager','nav.permit_types',false),('bu_head','nav.permit_types',false),('auditor','nav.permit_types',false),
  ('worker','nav.sla_monitor',false),('supervisor','nav.sla_monitor',false),('manager','nav.sla_monitor',false),('auditor','nav.sla_monitor',false),
  ('worker','nav.training_admin',false),('supervisor','nav.training_admin',false),('auditor','nav.training_admin',false),
  ('worker','action.users.manage_permissions',false),('supervisor','action.users.manage_permissions',false),('manager','action.users.manage_permissions',false),('bu_head','action.users.manage_permissions',false),('safety_officer','action.users.manage_permissions',false),('auditor','action.users.manage_permissions',false),
  ('worker','action.incidents.delete',false),('supervisor','action.incidents.delete',false),('manager','action.incidents.delete',false),('bu_head','action.incidents.delete',false),('safety_officer','action.incidents.delete',false),('auditor','action.incidents.delete',false),
  ('worker','action.incidents.approve',false),('supervisor','action.incidents.approve',false),('auditor','action.incidents.approve',false),
  ('worker','action.incidents.close',false),('supervisor','action.incidents.close',false),('auditor','action.incidents.close',false),
  ('worker','action.permits.approve',false),('supervisor','action.permits.approve',false),('auditor','action.permits.approve',false),
  ('worker','action.permits.reject',false),('supervisor','action.permits.reject',false),('auditor','action.permits.reject',false),
  ('worker','action.assets.archive',false),('supervisor','action.assets.archive',false),('manager','action.assets.archive',false),('bu_head','action.assets.archive',false),('auditor','action.assets.archive',false),
  ('worker','action.emergency.trigger',false),('supervisor','action.emergency.trigger',false),('auditor','action.emergency.trigger',false),
  ('worker','action.emergency.resolve',false),('supervisor','action.emergency.resolve',false),('auditor','action.emergency.resolve',false)
ON CONFLICT (role, permission_key) DO NOTHING;
