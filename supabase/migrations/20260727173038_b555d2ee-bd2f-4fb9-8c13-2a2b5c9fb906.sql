CREATE TABLE public.annual_review_missing_system_slot_repair_2026_07 (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id uuid NOT NULL,
  employee_code text,
  employee_name text,
  slot_key text NOT NULL,
  slot_name text,
  applied_points numeric,
  applied_raw numeric,
  prior_system_scores jsonb,
  prior_system_scores_raw jsonb,
  prior_total_score numeric,
  prior_final_rating text,
  prior_criteria_weighted_score numeric,
  new_total_score numeric,
  new_final_rating text,
  reason text,
  performed_by uuid,
  applied_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.annual_review_missing_system_slot_repair_2026_07 TO authenticated;
GRANT ALL ON public.annual_review_missing_system_slot_repair_2026_07 TO service_role;

ALTER TABLE public.annual_review_missing_system_slot_repair_2026_07 ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read missing system slot repair audit"
ON public.annual_review_missing_system_slot_repair_2026_07
FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'hr_pms'::app_role));