
CREATE TABLE IF NOT EXISTS public.annual_review_reviewer_remap_audit_2026_07 (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id uuid NOT NULL,
  cycle_id uuid,
  employee_code text,
  employee_name text,
  slot text NOT NULL,          -- 'manager_id' | 'skip_id'
  old_user_id uuid,
  new_user_id uuid,
  old_overall_status text,
  reason text,
  corrected_by uuid,
  corrected_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.annual_review_reviewer_remap_audit_2026_07 TO authenticated;
GRANT ALL    ON public.annual_review_reviewer_remap_audit_2026_07 TO service_role;

ALTER TABLE public.annual_review_reviewer_remap_audit_2026_07 ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_hr_read_reviewer_remap_audit"
ON public.annual_review_reviewer_remap_audit_2026_07
FOR SELECT TO authenticated
USING (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'hr_pms'::app_role));
