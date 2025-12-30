-- Create system_settings table for admin-controlled configurations
CREATE TABLE public.system_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  setting_key TEXT UNIQUE NOT NULL,
  setting_value JSONB NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read settings
CREATE POLICY "Allow authenticated users to read settings"
  ON public.system_settings FOR SELECT TO authenticated USING (true);

-- Only admins can modify settings
CREATE POLICY "Allow admins to manage settings"
  ON public.system_settings FOR ALL
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- Add trigger for updated_at
CREATE TRIGGER update_system_settings_updated_at
  BEFORE UPDATE ON public.system_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Insert default score calculation mode setting
INSERT INTO public.system_settings (setting_key, setting_value, description)
VALUES (
  'score_calculation_mode',
  '"manual"',
  'Controls score calculation in review stages: manual, auto_calculate, or suggested_override'
);

-- Add columns for reviewer achieved values at each stage
ALTER TABLE public.review_submissions 
ADD COLUMN IF NOT EXISTS manager_achieved_value NUMERIC,
ADD COLUMN IF NOT EXISTS auditor_achieved_value NUMERIC,
ADD COLUMN IF NOT EXISTS management_achieved_value NUMERIC;