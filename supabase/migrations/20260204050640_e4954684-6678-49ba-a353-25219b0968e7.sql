-- Create workflow_settings table for admin-configurable controls
CREATE TABLE public.workflow_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category TEXT NOT NULL,
  setting_key TEXT NOT NULL UNIQUE,
  setting_value JSONB NOT NULL,
  label TEXT NOT NULL,
  description TEXT,
  min_value NUMERIC,
  max_value NUMERIC,
  unit TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.workflow_settings ENABLE ROW LEVEL SECURITY;

-- Create policy for viewing settings (all authenticated users can view)
CREATE POLICY "Anyone can view workflow settings"
ON public.workflow_settings
FOR SELECT
USING (true);

-- Create policy for updating settings (only admins can update)
CREATE POLICY "Only admins can update workflow settings"
ON public.workflow_settings
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
    AND role = 'admin'
  )
);

-- Create trigger for updated_at
CREATE TRIGGER update_workflow_settings_updated_at
BEFORE UPDATE ON public.workflow_settings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Seed default values
INSERT INTO public.workflow_settings (category, setting_key, setting_value, label, description, min_value, max_value, unit) VALUES
-- Submission Windows
('submission', 'daily_submission_window_days', '2', 'Daily Submission Window', 'Number of past days employees can submit daily KPI entries', 1, 7, 'days'),
('submission', 'resubmission_grace_hours', '0', 'Resubmission Grace Period', 'Hours after initial submission when resubmission is allowed without penalty', 0, 72, 'hours'),
('submission', 'working_days_per_month', '22', 'Working Days per Month', 'Standard working days used for missed days penalty calculation', 18, 26, 'days'),

-- SLA Thresholds
('sla', 'query_sla_warning_days', '5', 'Query Warning Threshold', 'Days before query is flagged as high priority', 1, 14, 'days'),
('sla', 'query_sla_critical_days', '10', 'Query Critical Threshold', 'Days before query is marked critical/overdue', 3, 30, 'days'),
('sla', 'stalled_kpi_warning_days', '14', 'Stalled KPI Warning', 'Days at same status before KPI is flagged', 7, 30, 'days'),
('sla', 'stalled_kpi_critical_days', '30', 'Stalled KPI Critical', 'Days at same status before KPI is marked critical', 14, 60, 'days'),
('sla', 'pending_kra_warning_days', '7', 'Pending KRA Warning', 'Days after assignment before warning flag', 3, 14, 'days'),
('sla', 'pending_kra_critical_days', '14', 'Pending KRA Critical', 'Days after assignment before critical flag', 7, 30, 'days'),

-- Validation Rules
('validation', 'na_reason_min_chars', '50', 'N/A Reason Minimum Length', 'Minimum characters required when marking a KPI as N/A', 10, 200, 'characters'),
('validation', 'require_evidence_default', 'false', 'Require Evidence by Default', 'Default value for mandatory evidence when creating KPIs', NULL, NULL, NULL),
('validation', 'password_min_length', '6', 'Password Minimum Length', 'Minimum characters required for user passwords', 6, 16, 'characters'),

-- Observation Settings
('observation', 'max_observation_impact', '5', 'Max Observation Score Impact', 'Maximum points an observation can add or deduct', 1, 5, 'points'),
('observation', 'self_observation_auto_apply', 'false', 'Auto-Apply Self Observations', 'Automatically apply score impact from employee self-observations', NULL, NULL, NULL);