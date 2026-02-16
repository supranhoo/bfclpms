
-- Phase 4: Audit Trail for Org KPI Data Entry
CREATE TABLE public.org_kpi_data_entry_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_kpi_value_id UUID REFERENCES public.org_kpi_values(id) ON DELETE SET NULL,
  category_id UUID NOT NULL,
  kra_name TEXT NOT NULL,
  kpi_name TEXT NOT NULL,
  review_period TEXT NOT NULL,
  review_year INTEGER NOT NULL,
  action TEXT NOT NULL,
  performed_by UUID REFERENCES auth.users(id),
  old_value NUMERIC,
  new_value NUMERIC,
  remarks TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.org_kpi_data_entry_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins and data owners can view audit logs"
  ON public.org_kpi_data_entry_logs FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin')
    OR performed_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.org_kpi_data_owners
      WHERE owner_id = auth.uid()
        AND category_id = org_kpi_data_entry_logs.category_id
        AND kra_name = org_kpi_data_entry_logs.kra_name
        AND kpi_name = org_kpi_data_entry_logs.kpi_name
    )
  );

CREATE POLICY "Authenticated users can insert audit logs"
  ON public.org_kpi_data_entry_logs FOR INSERT
  WITH CHECK (auth.uid() = performed_by);

CREATE INDEX idx_org_kpi_data_entry_logs_lookup 
  ON public.org_kpi_data_entry_logs(category_id, kra_name, kpi_name, review_period, review_year);

CREATE INDEX idx_org_kpi_data_entry_logs_value_id 
  ON public.org_kpi_data_entry_logs(org_kpi_value_id);
