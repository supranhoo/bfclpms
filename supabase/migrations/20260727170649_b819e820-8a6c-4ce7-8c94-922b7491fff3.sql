CREATE TABLE public.annual_review_bu_draft_finalise_2026_07 (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id uuid NOT NULL,
  employee_code text,
  employee_name text,
  response_id uuid,
  reviewer_role text,
  prior_status text,
  prior_is_locked boolean,
  prior_submitted_at timestamptz,
  prior_total_score numeric,
  prior_criteria_weighted_score numeric,
  prior_final_rating text,
  prior_finalized_at timestamptz,
  criteria_scores jsonb,
  response_weighted_score numeric,
  new_status text,
  new_total_score numeric,
  new_criteria_weighted_score numeric,
  new_final_rating text,
  reason text NOT NULL,
  performed_by uuid,
  applied_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.annual_review_bu_draft_finalise_2026_07 TO authenticated;
GRANT ALL ON public.annual_review_bu_draft_finalise_2026_07 TO service_role;

ALTER TABLE public.annual_review_bu_draft_finalise_2026_07 ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view bu draft finalise audit"
  ON public.annual_review_bu_draft_finalise_2026_07
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));