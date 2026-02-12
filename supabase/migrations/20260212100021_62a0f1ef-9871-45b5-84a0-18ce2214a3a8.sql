
-- Feature 5: Org KPI Value Change History / Audit Log
CREATE TABLE public.org_kpi_value_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_kpi_value_id UUID NOT NULL REFERENCES public.org_kpi_values(id) ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES public.kra_categories(id),
  kra_name TEXT NOT NULL,
  kpi_name TEXT NOT NULL,
  review_period TEXT NOT NULL,
  review_year INTEGER NOT NULL,
  old_achieved_value NUMERIC,
  new_achieved_value NUMERIC,
  old_status TEXT,
  new_status TEXT,
  changed_by UUID REFERENCES public.profiles(id),
  change_type TEXT NOT NULL DEFAULT 'update', -- 'create', 'update', 'status_change', 'propagation'
  propagated_count INTEGER DEFAULT 0,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.org_kpi_value_history ENABLE ROW LEVEL SECURITY;

-- Admin-only access policy
CREATE POLICY "Admins can view org kpi value history"
  ON public.org_kpi_value_history
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "System can insert org kpi value history"
  ON public.org_kpi_value_history
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Index for fast lookups
CREATE INDEX idx_org_kpi_value_history_value_id ON public.org_kpi_value_history(org_kpi_value_id);
CREATE INDEX idx_org_kpi_value_history_lookup ON public.org_kpi_value_history(category_id, kra_name, kpi_name, review_period, review_year);
CREATE INDEX idx_org_kpi_value_history_created ON public.org_kpi_value_history(created_at DESC);
