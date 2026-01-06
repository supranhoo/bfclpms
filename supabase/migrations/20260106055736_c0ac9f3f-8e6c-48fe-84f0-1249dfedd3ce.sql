-- Create designations table
CREATE TABLE public.designations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  code TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create pms_grades table
CREATE TABLE public.pms_grades (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  code TEXT,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.designations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pms_grades ENABLE ROW LEVEL SECURITY;

-- RLS policies for designations
CREATE POLICY "Admins can manage designations" ON public.designations
FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Authenticated users can view designations" ON public.designations
FOR SELECT USING (true);

-- RLS policies for pms_grades
CREATE POLICY "Admins can manage pms_grades" ON public.pms_grades
FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Authenticated users can view pms_grades" ON public.pms_grades
FOR SELECT USING (true);