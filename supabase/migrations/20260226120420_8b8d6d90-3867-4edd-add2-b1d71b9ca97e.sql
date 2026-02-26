
-- Create audit_kpi_assignments table
CREATE TABLE public.audit_kpi_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auditor_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  assigned_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (auditor_id, employee_id)
);

-- Enable RLS
ALTER TABLE public.audit_kpi_assignments ENABLE ROW LEVEL SECURITY;

-- SELECT: All authenticated auditors can read assignments
CREATE POLICY "Auditors can view audit assignments"
  ON public.audit_kpi_assignments
  FOR SELECT
  TO authenticated
  USING (
    has_role(auth.uid(), 'auditor'::app_role)
    OR has_role(auth.uid(), 'admin'::app_role)
  );

-- INSERT: Admins and auditors can create assignments
CREATE POLICY "Auditors can create audit assignments"
  ON public.audit_kpi_assignments
  FOR INSERT
  TO authenticated
  WITH CHECK (
    has_role(auth.uid(), 'auditor'::app_role)
    OR has_role(auth.uid(), 'admin'::app_role)
  );

-- DELETE: Admins and auditors can remove assignments
CREATE POLICY "Auditors can delete audit assignments"
  ON public.audit_kpi_assignments
  FOR DELETE
  TO authenticated
  USING (
    has_role(auth.uid(), 'auditor'::app_role)
    OR has_role(auth.uid(), 'admin'::app_role)
  );

-- UPDATE: Admins and auditors can update assignments
CREATE POLICY "Auditors can update audit assignments"
  ON public.audit_kpi_assignments
  FOR UPDATE
  TO authenticated
  USING (
    has_role(auth.uid(), 'auditor'::app_role)
    OR has_role(auth.uid(), 'admin'::app_role)
  );
