
-- Create backup_logs table
CREATE TABLE public.backup_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  backup_type text NOT NULL DEFAULT 'manual',
  status text NOT NULL DEFAULT 'running',
  file_path text,
  file_size_bytes bigint,
  tables_count integer DEFAULT 0,
  total_rows integer DEFAULT 0,
  created_by uuid,
  error_message text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  completed_at timestamp with time zone
);

-- Enable RLS
ALTER TABLE public.backup_logs ENABLE ROW LEVEL SECURITY;

-- Only admins can read backup logs
CREATE POLICY "Admins can view backup logs"
  ON public.backup_logs FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Only admins can insert backup logs
CREATE POLICY "Admins can create backup logs"
  ON public.backup_logs FOR INSERT
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Only admins can update backup logs
CREATE POLICY "Admins can update backup logs"
  ON public.backup_logs FOR UPDATE
  USING (has_role(auth.uid(), 'admin'::app_role));

-- System (service role) can also insert/update for scheduled backups
CREATE POLICY "Service role can manage backup logs"
  ON public.backup_logs FOR ALL
  USING (auth.role() = 'service_role');

-- Create storage bucket for database backups
INSERT INTO storage.buckets (id, name, public)
VALUES ('database-backups', 'database-backups', false);

-- Storage policies: only admins can access backup files
CREATE POLICY "Admins can read backup files"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'database-backups' AND has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can upload backup files"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'database-backups' AND has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Service role can manage backup files"
  ON storage.objects FOR ALL
  USING (bucket_id = 'database-backups' AND auth.role() = 'service_role');

-- Insert auto_backup_enabled system setting
INSERT INTO public.system_settings (setting_key, setting_value, description)
VALUES ('auto_backup_enabled', '"enabled"'::jsonb, 'Toggle for weekly automated database backups (every Sunday at 2 AM UTC)');

-- Enable pg_cron and pg_net extensions
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
