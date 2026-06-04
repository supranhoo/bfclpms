INSERT INTO public.system_settings (setting_key, setting_value, description)
VALUES (
  'backup_hard_fail_on_partial',
  'true'::jsonb,
  'Phase 9.2 WP-a — When true (production default), any scheduled or manual backup whose backed-up table count is below the discovered table count is marked status=failed instead of completed_with_errors. Set to false ONLY as an emergency admin override to intentionally accept a partial backup; document the reason in admin notes. true = strict (hard-fail partial). false = permissive (legacy completed_with_errors behaviour).'
)
ON CONFLICT (setting_key) DO NOTHING;