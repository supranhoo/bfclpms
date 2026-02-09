
-- Create levels table (mirrors pms_grades)
CREATE TABLE public.levels (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  code TEXT,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.levels ENABLE ROW LEVEL SECURITY;

-- RLS: authenticated users can read
CREATE POLICY "Authenticated users can read levels"
  ON public.levels FOR SELECT TO authenticated USING (true);

-- RLS: admins can insert
CREATE POLICY "Admins can insert levels"
  ON public.levels FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- RLS: admins can update
CREATE POLICY "Admins can update levels"
  ON public.levels FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- RLS: admins can delete
CREATE POLICY "Admins can delete levels"
  ON public.levels FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Add level column to profiles
ALTER TABLE public.profiles ADD COLUMN level TEXT;
