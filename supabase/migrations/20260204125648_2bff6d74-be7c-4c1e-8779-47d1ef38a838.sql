-- Create employee_working_days table for per-employee monthly working days
CREATE TABLE public.employee_working_days (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  month VARCHAR(20) NOT NULL,
  year INTEGER NOT NULL,
  working_days INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(employee_id, month, year)
);

-- Add constraint for valid working days range
ALTER TABLE public.employee_working_days ADD CONSTRAINT working_days_range CHECK (working_days BETWEEN 1 AND 31);

-- Add day_count_type column to kpis table
ALTER TABLE public.kpis ADD COLUMN day_count_type VARCHAR(20) DEFAULT 'working_days';

-- Add constraint for valid day_count_type values
ALTER TABLE public.kpis ADD CONSTRAINT valid_day_count_type CHECK (day_count_type IN ('working_days', 'all_days'));

-- Enable RLS on employee_working_days
ALTER TABLE public.employee_working_days ENABLE ROW LEVEL SECURITY;

-- RLS Policies for employee_working_days
-- Admins can do everything
CREATE POLICY "Admins can manage all employee working days"
ON public.employee_working_days
FOR ALL
USING (public.has_role(auth.uid(), 'admin'));

-- Employees can view their own working days
CREATE POLICY "Employees can view their own working days"
ON public.employee_working_days
FOR SELECT
USING (auth.uid() = employee_id);

-- Managers can view their reportees' working days
CREATE POLICY "Managers can view reportee working days"
ON public.employee_working_days
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = employee_working_days.employee_id
    AND p.reporting_manager_id = auth.uid()
  )
);

-- Trigger for updated_at
CREATE TRIGGER update_employee_working_days_updated_at
BEFORE UPDATE ON public.employee_working_days
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();