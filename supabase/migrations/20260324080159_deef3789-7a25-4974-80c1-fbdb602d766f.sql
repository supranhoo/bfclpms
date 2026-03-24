
-- Create incentive_eligibility_fields table
CREATE TABLE public.incentive_eligibility_fields (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id uuid REFERENCES public.incentive_programs(id) ON DELETE CASCADE,
  field_key text NOT NULL,
  field_label text NOT NULL,
  field_type text NOT NULL DEFAULT 'number',
  is_required boolean DEFAULT false,
  default_value text,
  sort_order int DEFAULT 0,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- RLS
ALTER TABLE public.incentive_eligibility_fields ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view eligibility fields"
  ON public.incentive_eligibility_fields FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Admins can manage eligibility fields"
  ON public.incentive_eligibility_fields FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Add custom_fields JSONB column to employee_incentive_eligibility
ALTER TABLE public.employee_incentive_eligibility
  ADD COLUMN IF NOT EXISTS custom_fields jsonb DEFAULT '{}';

-- Seed default global fields (program_id = NULL = global)
INSERT INTO public.incentive_eligibility_fields (program_id, field_key, field_label, field_type, is_required, sort_order) VALUES
  (NULL, 'absent_days', 'Absent Days', 'number', false, 1),
  (NULL, 'lwp_days', 'LWP Days', 'number', false, 2),
  (NULL, 'has_warning_letter', 'Warning Letter', 'boolean', false, 3),
  (NULL, 'is_suspended', 'Suspended', 'boolean', false, 4),
  (NULL, 'is_contract_worker', 'Contract Worker', 'boolean', false, 5),
  (NULL, 'lti_count', 'LTI Count', 'number', false, 6),
  (NULL, 'department_lti_count', 'Dept LTI Count', 'number', false, 7),
  (NULL, 'total_working_days', 'Total Working Days', 'number', false, 8),
  (NULL, 'present_days', 'Present Days', 'number', false, 9),
  (NULL, 'weekly_off_days', 'Weekly Off Days', 'number', false, 10),
  (NULL, 'production_value', 'Production Value', 'number', false, 11),
  (NULL, 'availability_percent', 'Availability %', 'number', false, 12),
  (NULL, 'shutdown_hours', 'Shutdown Hours', 'number', false, 13);
