-- Create template_bundles table
CREATE TABLE public.template_bundles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  department_id UUID REFERENCES public.departments(id) ON DELETE SET NULL,
  designation TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Create template_bundle_items junction table
CREATE TABLE public.template_bundle_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bundle_id UUID NOT NULL REFERENCES public.template_bundles(id) ON DELETE CASCADE,
  template_id UUID NOT NULL REFERENCES public.kpi_templates(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(bundle_id, template_id)
);

-- Enable RLS
ALTER TABLE public.template_bundles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.template_bundle_items ENABLE ROW LEVEL SECURITY;

-- RLS Policies for template_bundles
CREATE POLICY "Admins can manage all bundles"
ON public.template_bundles
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Authenticated users can view active bundles"
ON public.template_bundles
FOR SELECT
TO authenticated
USING (is_active = true);

-- RLS Policies for template_bundle_items
CREATE POLICY "Admins can manage all bundle items"
ON public.template_bundle_items
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Authenticated users can view bundle items"
ON public.template_bundle_items
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.template_bundles tb
    WHERE tb.id = bundle_id AND tb.is_active = true
  )
);

-- Add updated_at trigger for template_bundles
CREATE TRIGGER update_template_bundles_updated_at
BEFORE UPDATE ON public.template_bundles
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create index for faster lookups
CREATE INDEX idx_template_bundle_items_bundle_id ON public.template_bundle_items(bundle_id);
CREATE INDEX idx_template_bundles_department_id ON public.template_bundles(department_id);