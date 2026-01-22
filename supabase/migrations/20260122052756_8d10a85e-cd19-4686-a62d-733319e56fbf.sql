-- Create bundle assignment logs table for tracking history
CREATE TABLE public.bundle_assignment_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  bundle_id UUID NOT NULL REFERENCES public.template_bundles(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  assigned_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  review_period TEXT NOT NULL,
  review_year INTEGER NOT NULL,
  kpis_created INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.bundle_assignment_logs ENABLE ROW LEVEL SECURITY;

-- Policies for bundle assignment logs
CREATE POLICY "Admins can view all bundle assignment logs"
  ON public.bundle_assignment_logs
  FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert bundle assignment logs"
  ON public.bundle_assignment_logs
  FOR INSERT
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Add index for faster lookups
CREATE INDEX idx_bundle_assignment_logs_bundle_id ON public.bundle_assignment_logs(bundle_id);
CREATE INDEX idx_bundle_assignment_logs_employee_id ON public.bundle_assignment_logs(employee_id);
CREATE INDEX idx_bundle_assignment_logs_created_at ON public.bundle_assignment_logs(created_at DESC);