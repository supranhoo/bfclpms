INSERT INTO public.workflow_settings (category, setting_key, setting_value, label, description, min_value, max_value, unit)
VALUES (
  'validation',
  'dashboard_kra_management_roles',
  '["admin"]'::jsonb,
  'Roles allowed to Add/Delete KRA from Dashboard',
  'Members of these roles see Add KRA / Delete KRA buttons on their Dashboard. Admin is always allowed.',
  NULL, NULL, NULL
)
ON CONFLICT (setting_key) DO NOTHING;