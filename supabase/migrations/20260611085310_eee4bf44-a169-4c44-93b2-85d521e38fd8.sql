INSERT INTO public.safety_permission_keys (key, label, category, is_active)
VALUES ('action.incidents.view_internals', 'View Incident Internals (stage, SLA, evidence, progress)', 'action', true)
ON CONFLICT (key) DO UPDATE SET label = EXCLUDED.label, is_active = true;

INSERT INTO public.safety_role_permissions (role, permission_key, is_allowed)
SELECT r::safety_app_role, 'action.incidents.view_internals', true
FROM unnest(ARRAY['safety_head','safety_officer','bu_head','manager','supervisor','auditor']) AS r
ON CONFLICT (role, permission_key) DO UPDATE SET is_allowed = true;