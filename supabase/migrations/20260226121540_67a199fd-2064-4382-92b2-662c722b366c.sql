
-- KPI-level audit assignments table (v1.46.20)
CREATE TABLE public.audit_kpi_level_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kpi_id uuid NOT NULL REFERENCES public.kpis(id) ON DELETE CASCADE,
  auditor_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  assigned_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (kpi_id, auditor_id)
);

ALTER TABLE public.audit_kpi_level_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Auditors can view kpi-level assignments"
  ON public.audit_kpi_level_assignments FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'auditor'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Auditors can create kpi-level assignments"
  ON public.audit_kpi_level_assignments FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'auditor'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Auditors can delete kpi-level assignments"
  ON public.audit_kpi_level_assignments FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'auditor'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Auditors can update kpi-level assignments"
  ON public.audit_kpi_level_assignments FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'auditor'::app_role) OR has_role(auth.uid(), 'admin'::app_role));
