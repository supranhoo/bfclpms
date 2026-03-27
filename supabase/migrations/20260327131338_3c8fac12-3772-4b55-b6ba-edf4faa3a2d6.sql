
-- Create incentive_program_types table
CREATE TABLE public.incentive_program_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  value text UNIQUE NOT NULL,
  label text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.incentive_program_types ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read
CREATE POLICY "Authenticated users can read program types"
  ON public.incentive_program_types
  FOR SELECT
  TO authenticated
  USING (true);

-- Only admins can insert
CREATE POLICY "Admins can insert program types"
  ON public.incentive_program_types
  FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Only admins can delete
CREATE POLICY "Admins can delete program types"
  ON public.incentive_program_types
  FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Seed default types
INSERT INTO public.incentive_program_types (value, label) VALUES
  ('support', 'Support Functions'),
  ('production', 'Production & Maintenance'),
  ('plant', 'Plant Incentive');
