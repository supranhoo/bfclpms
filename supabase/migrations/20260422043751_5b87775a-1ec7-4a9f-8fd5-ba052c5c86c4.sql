-- Create system_audit_logs for bulk/system-level admin actions (no per-row FK)
CREATE TABLE IF NOT EXISTS public.system_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action text NOT NULL,
  performed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_system_audit_logs_action ON public.system_audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_system_audit_logs_created_at ON public.system_audit_logs(created_at DESC);

ALTER TABLE public.system_audit_logs ENABLE ROW LEVEL SECURITY;

-- Only admins can view
CREATE POLICY "Admins can view system audit logs"
ON public.system_audit_logs
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Authenticated users can insert their own audit rows (gated by app logic; admins write here)
CREATE POLICY "Authenticated can insert system audit logs"
ON public.system_audit_logs
FOR INSERT
TO authenticated
WITH CHECK (performed_by = auth.uid() OR performed_by IS NULL);

-- Forensic immutability: no updates or deletes
CREATE POLICY "Nobody can update system audit logs"
ON public.system_audit_logs
FOR UPDATE
TO authenticated
USING (false);

CREATE POLICY "Nobody can delete system audit logs"
ON public.system_audit_logs
FOR DELETE
TO authenticated
USING (false);