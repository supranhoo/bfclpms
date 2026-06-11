
INSERT INTO public.safety_permission_keys (key, category, label, sort_order, is_active)
VALUES ('nav.incident_types', 'nav', 'Incident Types', 115, true)
ON CONFLICT (key) DO UPDATE SET label = EXCLUDED.label, category = EXCLUDED.category, is_active = true;

INSERT INTO public.safety_role_permissions (role, permission_key, is_allowed) VALUES
  ('worker'::public.safety_app_role,     'nav.incident_types', false),
  ('supervisor'::public.safety_app_role, 'nav.incident_types', false),
  ('manager'::public.safety_app_role,    'nav.incident_types', false),
  ('auditor'::public.safety_app_role,    'nav.incident_types', false)
ON CONFLICT (role, permission_key) DO UPDATE SET is_allowed = EXCLUDED.is_allowed;
