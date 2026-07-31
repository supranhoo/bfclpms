CREATE TABLE public.annual_review_status_repair_2026_07 (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id uuid NOT NULL,
  employee_id uuid,
  employee_code text,
  prior_status text,
  new_status text,
  reason text NOT NULL,
  performed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.annual_review_status_repair_2026_07 TO authenticated;
GRANT ALL ON public.annual_review_status_repair_2026_07 TO service_role;

ALTER TABLE public.annual_review_status_repair_2026_07 ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view annual review status repairs"
ON public.annual_review_status_repair_2026_07
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role));