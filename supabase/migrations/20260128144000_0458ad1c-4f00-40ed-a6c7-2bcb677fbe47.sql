-- Add enabled_modules to app_settings
ALTER TABLE app_settings 
ADD COLUMN IF NOT EXISTS enabled_modules jsonb DEFAULT '["pms"]'::jsonb;

-- Create modules table
CREATE TABLE IF NOT EXISTS public.modules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  name text NOT NULL,
  description text,
  icon text NOT NULL,
  color text DEFAULT 'primary',
  route text NOT NULL,
  is_enabled boolean DEFAULT true,
  display_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.modules ENABLE ROW LEVEL SECURITY;

-- Allow all authenticated users to read modules
CREATE POLICY "Modules are viewable by authenticated users"
ON public.modules
FOR SELECT
TO authenticated
USING (true);

-- Only admins can modify modules
CREATE POLICY "Admins can manage modules"
ON public.modules
FOR ALL
USING (public.has_role(auth.uid(), 'admin'));

-- Seed PMS module
INSERT INTO public.modules (code, name, description, icon, route, display_order)
VALUES ('pms', 'Performance Management', 'Track KPIs, conduct reviews, and drive organizational growth', 'Target', '/dashboard', 1)
ON CONFLICT (code) DO NOTHING;