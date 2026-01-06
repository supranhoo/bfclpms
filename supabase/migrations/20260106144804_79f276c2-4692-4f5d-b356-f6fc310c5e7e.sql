-- Create KPI Templates table for the KRA Library
CREATE TABLE public.kpi_templates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  category_id UUID REFERENCES public.kra_categories(id) ON DELETE SET NULL,
  kra_name TEXT NOT NULL,
  kpi_name TEXT NOT NULL,
  uom TEXT,
  target_value NUMERIC,
  weightage NUMERIC DEFAULT 0,
  criteria TEXT DEFAULT 'Higher is Better',
  frequency TEXT,
  source_of_data TEXT,
  r5 TEXT,
  r4 TEXT,
  r3 TEXT,
  r2 TEXT,
  r1 TEXT,
  r0 TEXT,
  applicable_roles TEXT[] DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);

-- Enable RLS
ALTER TABLE public.kpi_templates ENABLE ROW LEVEL SECURITY;

-- Admins can manage all templates
CREATE POLICY "Admins can manage kpi_templates"
ON public.kpi_templates
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

-- Authenticated users can view templates
CREATE POLICY "Authenticated users can view kpi_templates"
ON public.kpi_templates
FOR SELECT
USING (true);

-- Create trigger for updated_at
CREATE TRIGGER update_kpi_templates_updated_at
BEFORE UPDATE ON public.kpi_templates
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();