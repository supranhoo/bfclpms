-- Add system setting for auto-rollover toggle
INSERT INTO system_settings (setting_key, setting_value, description)
VALUES (
  'auto_kra_rollover',
  '"enabled"',
  'Controls automatic KRA rollover on the 1st of each month: enabled or disabled'
) ON CONFLICT (setting_key) DO NOTHING;

-- Create rollover tracking table for audit
CREATE TABLE IF NOT EXISTS public.kra_rollover_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_period TEXT NOT NULL,
  source_year INTEGER NOT NULL,
  target_period TEXT NOT NULL,
  target_year INTEGER NOT NULL,
  kpis_copied INTEGER NOT NULL DEFAULT 0,
  employees_affected INTEGER NOT NULL DEFAULT 0,
  triggered_by TEXT NOT NULL DEFAULT 'system',
  status TEXT NOT NULL DEFAULT 'completed',
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS on rollover logs
ALTER TABLE public.kra_rollover_logs ENABLE ROW LEVEL SECURITY;

-- Only admins can view rollover logs
CREATE POLICY "Admins can view rollover logs"
ON public.kra_rollover_logs
FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

-- System can insert rollover logs (via service role in edge function)
CREATE POLICY "System can insert rollover logs"
ON public.kra_rollover_logs
FOR INSERT
WITH CHECK (true);