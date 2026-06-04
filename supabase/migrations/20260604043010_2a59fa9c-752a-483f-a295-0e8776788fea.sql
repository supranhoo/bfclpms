INSERT INTO public.backup_denylist (table_name, reason)
VALUES (
  'impl_console_rate_buckets',
  'Ephemeral per-hour rate-limit counters for Implementation Console test emails. Pruned by edge functions; no business value in backups.'
)
ON CONFLICT (table_name) DO NOTHING;
