CREATE TABLE public.annual_review_self_restore_repair_2026_07 (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id uuid NOT NULL,
  employee_id uuid NOT NULL,
  employee_code text,
  cycle_id uuid,
  archive_id uuid,
  prior_status text,
  prior_template_id uuid,
  restored_status text,
  restored_template_id uuid,
  restored_response_id uuid,
  restored_response jsonb,
  reason text NOT NULL,
  performed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.annual_review_self_restore_repair_2026_07 TO authenticated;
GRANT ALL ON public.annual_review_self_restore_repair_2026_07 TO service_role;

ALTER TABLE public.annual_review_self_restore_repair_2026_07 ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ar_self_restore_repair_admin_read"
ON public.annual_review_self_restore_repair_2026_07
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'hr_pms'));