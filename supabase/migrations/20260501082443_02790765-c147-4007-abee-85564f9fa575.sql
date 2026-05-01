
-- =============================================================
-- KPI Definitions (Master Registry)
-- =============================================================
CREATE TABLE public.kpi_definitions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  canonical_kra_name TEXT NOT NULL,
  canonical_kpi_name TEXT NOT NULL,
  category_id UUID NOT NULL REFERENCES public.kra_categories(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(canonical_kra_name, canonical_kpi_name, category_id)
);

ALTER TABLE public.kpi_definitions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view kpi_definitions"
  ON public.kpi_definitions FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Admins can insert kpi_definitions"
  ON public.kpi_definitions FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update kpi_definitions"
  ON public.kpi_definitions FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete kpi_definitions"
  ON public.kpi_definitions FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- =============================================================
-- KPI Name Aliases (Cross-Month Linking)
-- =============================================================
CREATE TABLE public.kpi_name_aliases (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  definition_id UUID NOT NULL REFERENCES public.kpi_definitions(id) ON DELETE CASCADE,
  variant_kra_name TEXT NOT NULL,
  variant_kpi_name TEXT NOT NULL,
  category_id UUID NOT NULL REFERENCES public.kra_categories(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(variant_kra_name, variant_kpi_name, category_id)
);

ALTER TABLE public.kpi_name_aliases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view kpi_name_aliases"
  ON public.kpi_name_aliases FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Admins can insert kpi_name_aliases"
  ON public.kpi_name_aliases FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update kpi_name_aliases"
  ON public.kpi_name_aliases FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete kpi_name_aliases"
  ON public.kpi_name_aliases FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- =============================================================
-- Add kpi_definition_id to kpis table
-- =============================================================
ALTER TABLE public.kpis
  ADD COLUMN kpi_definition_id UUID REFERENCES public.kpi_definitions(id) ON DELETE SET NULL;

CREATE INDEX idx_kpis_kpi_definition_id ON public.kpis(kpi_definition_id);
CREATE INDEX idx_kpi_name_aliases_definition_id ON public.kpi_name_aliases(definition_id);
CREATE INDEX idx_kpi_definitions_category_id ON public.kpi_definitions(category_id);

-- =============================================================
-- Resolve function: given variant names, find canonical definition
-- =============================================================
CREATE OR REPLACE FUNCTION public.resolve_canonical_kpi(
  p_category_id UUID,
  p_kra_name TEXT,
  p_kpi_name TEXT
)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT definition_id
  FROM public.kpi_name_aliases
  WHERE category_id = p_category_id
    AND variant_kra_name = p_kra_name
    AND variant_kpi_name = p_kpi_name
  LIMIT 1;
$$;

-- =============================================================
-- Timestamp trigger for kpi_definitions
-- =============================================================
CREATE TRIGGER update_kpi_definitions_updated_at
  BEFORE UPDATE ON public.kpi_definitions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
