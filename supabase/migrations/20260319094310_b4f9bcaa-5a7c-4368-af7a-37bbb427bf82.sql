
-- Add source_template_id to kpis table
ALTER TABLE public.kpis ADD COLUMN source_template_id uuid REFERENCES public.kpi_templates(id) ON DELETE SET NULL;
CREATE INDEX idx_kpis_source_template ON public.kpis(source_template_id);

-- Temporarily disable triggers for backfill
ALTER TABLE public.kpis DISABLE TRIGGER check_period_lock_on_kpi_update;
ALTER TABLE public.kpis DISABLE TRIGGER update_kpis_updated_at;

-- Backfill existing KPIs to link them to templates
UPDATE public.kpis k
SET source_template_id = t.id
FROM public.kpi_templates t
WHERE lower(k.kra_name) = lower(t.kra_name)
  AND lower(k.kpi_name) = lower(t.kpi_name)
  AND k.category_id = t.category_id
  AND k.source_template_id IS NULL;

-- Re-enable triggers
ALTER TABLE public.kpis ENABLE TRIGGER check_period_lock_on_kpi_update;
ALTER TABLE public.kpis ENABLE TRIGGER update_kpis_updated_at;

-- Create template_change_logs table for audit trail
CREATE TABLE public.template_change_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid REFERENCES public.kpi_templates(id) NOT NULL,
  changed_by uuid NOT NULL,
  effective_month text NOT NULL,
  effective_year integer NOT NULL,
  fields_changed jsonb NOT NULL,
  employees_affected integer DEFAULT 0,
  kpis_updated integer DEFAULT 0,
  scope text DEFAULT 'all',
  selected_employee_ids uuid[] DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.template_change_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage template change logs"
  ON public.template_change_logs FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
