
-- 1) Flip default in has_safety_permission: missing rule = DENY (admin bypass remains).
CREATE OR REPLACE FUNCTION public.has_safety_permission(_user_id uuid, _key text)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_override text;
  v_any_allow boolean;
BEGIN
  IF _user_id IS NULL OR _key IS NULL THEN RETURN false; END IF;

  -- Admin bypass.
  IF public.has_safety_role(_user_id,'admin') THEN RETURN true; END IF;

  -- Per-user override wins.
  SELECT effect INTO v_override
    FROM public.safety_user_permission_overrides
   WHERE user_id = _user_id AND permission_key = _key;
  IF v_override = 'deny'  THEN RETURN false; END IF;
  IF v_override = 'allow' THEN RETURN true;  END IF;

  -- Role matrix: only explicit allow rows grant access.
  SELECT bool_or(rp.is_allowed) INTO v_any_allow
    FROM public.safety_user_roles ur
    JOIN public.safety_role_permissions rp
      ON rp.role = ur.role
     AND rp.permission_key = _key
   WHERE ur.user_id = _user_id;

  -- nav.home stays universal so every Safety user can reach the hub landing.
  IF _key = 'nav.home' THEN RETURN true; END IF;

  RETURN COALESCE(v_any_allow, false);
END$$;

-- 2) Seed reasonable role defaults so existing users do not lose everything.
--    Only inserts rows that do not already exist; never overrides admin's prior denies.
INSERT INTO public.safety_role_permissions (role, permission_key, is_allowed)
SELECT r.role::safety_app_role, k.key, true
FROM (VALUES
  -- safety_head: full visibility & action set
  ('safety_head', ARRAY[
    'nav.home','nav.incidents','nav.permits','nav.assets','nav.audits','nav.emergency',
    'nav.training_my','nav.training_admin','nav.analytics','nav.hours_worked',
    'nav.permit_types','nav.sla_monitor','nav.users_roles','nav.audit_log',
    'action.incidents.view','action.incidents.create','action.incidents.edit',
    'action.incidents.assign','action.incidents.investigate','action.incidents.approve','action.incidents.close',
    'action.permits.view','action.permits.create','action.permits.approve','action.permits.reject','action.permits.close',
    'action.assets.view','action.assets.create','action.assets.edit','action.assets.calibrate','action.assets.archive',
    'action.audits.view','action.audits.create','action.audits.execute','action.audits.close',
    'action.training.view','action.training.assign','action.training.complete','action.training.administer',
    'action.emergency.view','action.emergency.trigger','action.emergency.resolve',
    'action.users.view',
    'widget.open_incidents','widget.overdue_incidents','widget.at_risk','widget.orphaned','widget.closed',
    'widget.my_assignments','widget.trend_30d','widget.stage_dist','widget.severity_dist',
    'widget.sla','widget.compliance','widget.training','widget.audit','widget.asset'
  ]),
  -- safety_officer: operational
  ('safety_officer', ARRAY[
    'nav.home','nav.incidents','nav.permits','nav.assets','nav.audits','nav.emergency',
    'nav.training_my','nav.training_admin','nav.analytics','nav.hours_worked',
    'action.incidents.view','action.incidents.create','action.incidents.edit',
    'action.incidents.assign','action.incidents.investigate',
    'action.permits.view','action.permits.create',
    'action.assets.view','action.assets.create','action.assets.edit','action.assets.calibrate',
    'action.audits.view','action.audits.create','action.audits.execute',
    'action.training.view','action.training.assign','action.training.complete','action.training.administer',
    'action.emergency.view','action.emergency.trigger',
    'action.users.view',
    'widget.open_incidents','widget.overdue_incidents','widget.at_risk','widget.orphaned','widget.closed',
    'widget.my_assignments','widget.trend_30d','widget.stage_dist','widget.severity_dist',
    'widget.sla','widget.compliance','widget.training','widget.audit','widget.asset'
  ]),
  -- bu_head: oversight
  ('bu_head', ARRAY[
    'nav.home','nav.incidents','nav.permits','nav.assets','nav.audits','nav.emergency',
    'nav.training_my','nav.analytics',
    'action.incidents.view','action.incidents.approve','action.incidents.close',
    'action.permits.view','action.permits.approve','action.permits.reject','action.permits.close',
    'action.assets.view','action.audits.view','action.training.view','action.emergency.view',
    'widget.open_incidents','widget.overdue_incidents','widget.at_risk','widget.closed',
    'widget.trend_30d','widget.stage_dist','widget.severity_dist','widget.sla','widget.compliance'
  ]),
  -- manager
  ('manager', ARRAY[
    'nav.home','nav.incidents','nav.permits','nav.assets','nav.audits','nav.emergency',
    'nav.training_my','nav.analytics',
    'action.incidents.view','action.incidents.create','action.incidents.edit','action.incidents.assign','action.incidents.investigate',
    'action.permits.view','action.permits.create',
    'action.assets.view','action.assets.edit','action.audits.view','action.audits.execute',
    'action.training.view','action.training.assign','action.training.complete',
    'action.emergency.view','action.emergency.trigger','action.emergency.resolve',
    'widget.open_incidents','widget.overdue_incidents','widget.at_risk','widget.my_assignments',
    'widget.trend_30d','widget.stage_dist','widget.severity_dist','widget.sla','widget.compliance','widget.training'
  ]),
  -- supervisor
  ('supervisor', ARRAY[
    'nav.home','nav.incidents','nav.permits','nav.assets','nav.audits','nav.emergency',
    'nav.training_my','nav.analytics',
    'action.incidents.view','action.incidents.create','action.incidents.edit','action.incidents.investigate',
    'action.permits.view','action.permits.create',
    'action.assets.view','action.assets.edit',
    'action.audits.view','action.audits.execute',
    'action.training.view','action.training.complete',
    'action.emergency.view',
    'widget.open_incidents','widget.my_assignments','widget.trend_30d','widget.severity_dist','widget.training'
  ]),
  -- worker: self-service only
  ('worker', ARRAY[
    'nav.home','nav.incidents','nav.permits','nav.emergency','nav.training_my',
    'action.incidents.view','action.incidents.create',
    'action.permits.view','action.permits.create',
    'action.training.view','action.training.complete',
    'action.emergency.view',
    'widget.my_assignments'
  ]),
  -- auditor: read-only
  ('auditor', ARRAY[
    'nav.home','nav.incidents','nav.permits','nav.assets','nav.audits','nav.emergency',
    'nav.analytics','nav.audit_log',
    'action.incidents.view','action.permits.view','action.assets.view','action.audits.view',
    'action.training.view','action.emergency.view','action.users.view',
    'widget.open_incidents','widget.overdue_incidents','widget.at_risk','widget.orphaned','widget.closed',
    'widget.trend_30d','widget.stage_dist','widget.severity_dist','widget.sla','widget.compliance','widget.training','widget.audit','widget.asset'
  ])
) AS r(role, keys)
CROSS JOIN LATERAL unnest(r.keys) AS k(key)
ON CONFLICT (role, permission_key) DO NOTHING;
