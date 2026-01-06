-- Add is_org_level flag to kra_categories
ALTER TABLE public.kra_categories 
ADD COLUMN IF NOT EXISTS is_org_level boolean NOT NULL DEFAULT false;

-- Create org_kpi_values table for storing verified organizational data
CREATE TABLE public.org_kpi_values (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  category_id uuid NOT NULL REFERENCES public.kra_categories(id) ON DELETE CASCADE,
  kra_name text NOT NULL,
  kpi_name text NOT NULL,
  review_period text NOT NULL,
  review_year integer NOT NULL,
  achieved_value numeric,
  data_source text,
  entered_by uuid REFERENCES public.profiles(id),
  remarks text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(category_id, kra_name, kpi_name, review_period, review_year)
);

-- Enable RLS
ALTER TABLE public.org_kpi_values ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Admins can manage org_kpi_values"
ON public.org_kpi_values
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Authenticated users can view org_kpi_values"
ON public.org_kpi_values
FOR SELECT
USING (true);

-- Create trigger for updated_at
CREATE TRIGGER update_org_kpi_values_updated_at
BEFORE UPDATE ON public.org_kpi_values
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create index for faster lookups
CREATE INDEX idx_org_kpi_values_lookup 
ON public.org_kpi_values(category_id, review_period, review_year);