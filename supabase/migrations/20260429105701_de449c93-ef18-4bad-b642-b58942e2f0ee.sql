-- Phase 0 bootstrap (deferred): enable Safety module globally and grant
-- Safety admin role to every existing PMS admin so the Hub card becomes
-- visible per the plan decision ("use PMS admin accounts as Safety admins").
UPDATE public.modules SET is_enabled = true WHERE code = 'safety';

INSERT INTO public.safety_user_roles (user_id, role, assigned_by)
SELECT ur.user_id, 'admin'::safety_app_role, ur.user_id
FROM public.user_roles ur
WHERE ur.role = 'admin'
ON CONFLICT DO NOTHING;