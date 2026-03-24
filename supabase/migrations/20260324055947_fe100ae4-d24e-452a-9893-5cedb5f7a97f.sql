
-- Create incentive_program_mappings table
CREATE TABLE public.incentive_program_mappings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  program_id UUID NOT NULL REFERENCES public.incentive_programs(id) ON DELETE CASCADE,
  mapping_type TEXT NOT NULL CHECK (mapping_type IN ('department', 'business_unit', 'designation', 'pms_grade', 'employee')),
  mapping_value TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(program_id, mapping_type, mapping_value)
);

-- Enable RLS
ALTER TABLE public.incentive_program_mappings ENABLE ROW LEVEL SECURITY;

-- Admin full CRUD
CREATE POLICY "Admins can manage program mappings"
  ON public.incentive_program_mappings
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Authenticated users can read
CREATE POLICY "Authenticated users can read program mappings"
  ON public.incentive_program_mappings
  FOR SELECT
  TO authenticated
  USING (true);
