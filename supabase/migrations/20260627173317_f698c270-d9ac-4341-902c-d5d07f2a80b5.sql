INSERT INTO public.system_settings (setting_key, setting_value, description)
VALUES (
  'backup_retention_policy',
  '{"enabled":false,"keep_completed_days":30,"keep_completed_min_count":10,"keep_partial_days":14,"keep_failed_days":7,"dry_run":false}',
  'Automatic pruning policy for backup_logs + storage. Disabled by default; admin opt-in via Admin → Backups → Retention Policy.'
)
ON CONFLICT (setting_key) DO NOTHING;