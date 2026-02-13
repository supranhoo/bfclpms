
-- Phase 1a: Add new columns to review_submissions
ALTER TABLE public.review_submissions
  ADD COLUMN IF NOT EXISTS skip_level_score numeric,
  ADD COLUMN IF NOT EXISTS skip_level_rating rating_level,
  ADD COLUMN IF NOT EXISTS skip_level_remarks text,
  ADD COLUMN IF NOT EXISTS skip_level_evidence_url text,
  ADD COLUMN IF NOT EXISTS skip_level_evidence_urls jsonb,
  ADD COLUMN IF NOT EXISTS skip_level_achieved_value numeric,
  ADD COLUMN IF NOT EXISTS hr_pms_score numeric,
  ADD COLUMN IF NOT EXISTS hr_pms_rating rating_level,
  ADD COLUMN IF NOT EXISTS hr_pms_remarks text,
  ADD COLUMN IF NOT EXISTS hr_pms_evidence_url text,
  ADD COLUMN IF NOT EXISTS hr_pms_evidence_urls jsonb,
  ADD COLUMN IF NOT EXISTS hr_pms_achieved_value numeric;

-- Add to sub_period_submissions too
ALTER TABLE public.sub_period_submissions
  ADD COLUMN IF NOT EXISTS skip_level_achieved_value integer,
  ADD COLUMN IF NOT EXISTS hr_pms_achieved_value integer;

-- Phase 1d: Insert new 8-stage workflow template
INSERT INTO public.workflow_templates (name, display_name, description, stages, is_default)
VALUES (
  'full_8_stage',
  'Full 8-Stage Review',
  'Complete review with Skip-Level RM and HR PMS Team',
  '["kra_set","self_review","manager_check","skip_level_check","hr_pms_review","audit","management_review","approved"]',
  false
)
ON CONFLICT (name) DO NOTHING;

-- Phase 1e: Create get_skip_level_manager DB function
CREATE OR REPLACE FUNCTION public.get_skip_level_manager(employee_uuid UUID)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p2.reporting_manager_id
  FROM profiles p1
  JOIN profiles p2 ON p1.reporting_manager_id = p2.id
  WHERE p1.id = employee_uuid;
$$;

-- RLS: Skip-level managers can view reports KPIs
CREATE POLICY "Skip-level managers can view reports KPIs"
ON public.kpis FOR SELECT
USING (EXISTS (
  SELECT 1 FROM profiles p
  WHERE p.id = kpis.employee_id
  AND get_skip_level_manager(p.id) = auth.uid()
));

-- RLS: Skip-level managers can update reports KPI status
CREATE POLICY "Skip-level managers can update reports KPI status"
ON public.kpis FOR UPDATE
USING (EXISTS (
  SELECT 1 FROM profiles p
  WHERE p.id = kpis.employee_id
  AND get_skip_level_manager(p.id) = auth.uid()
));

-- RLS: HR PMS can view all KPIs
CREATE POLICY "HR PMS can view all KPIs"
ON public.kpis FOR SELECT
USING (has_role(auth.uid(), 'hr_pms'::app_role));

-- RLS: HR PMS can update KPI status
CREATE POLICY "HR PMS can update KPI status during review"
ON public.kpis FOR UPDATE
USING (has_role(auth.uid(), 'hr_pms'::app_role));

-- RLS: Skip-level managers on review_submissions
CREATE POLICY "Skip-level managers can view reports submissions"
ON public.review_submissions FOR SELECT
USING (EXISTS (
  SELECT 1 FROM kpis k JOIN profiles p ON k.employee_id = p.id
  WHERE k.id = review_submissions.kpi_id
  AND get_skip_level_manager(p.id) = auth.uid()
));

CREATE POLICY "Skip-level managers can update reports submissions"
ON public.review_submissions FOR UPDATE
USING (EXISTS (
  SELECT 1 FROM kpis k JOIN profiles p ON k.employee_id = p.id
  WHERE k.id = review_submissions.kpi_id
  AND get_skip_level_manager(p.id) = auth.uid()
));

-- RLS: HR PMS on review_submissions
CREATE POLICY "HR PMS can view all submissions"
ON public.review_submissions FOR SELECT
USING (has_role(auth.uid(), 'hr_pms'::app_role));

CREATE POLICY "HR PMS can update submissions during review"
ON public.review_submissions FOR UPDATE
USING (has_role(auth.uid(), 'hr_pms'::app_role));

-- RLS: Skip-level and HR PMS on sub_period_submissions
CREATE POLICY "Skip-level managers can view reports sub-period submissions"
ON public.sub_period_submissions FOR SELECT
USING (EXISTS (
  SELECT 1 FROM kpis k JOIN profiles p ON k.employee_id = p.id
  WHERE k.id = sub_period_submissions.kpi_id
  AND get_skip_level_manager(p.id) = auth.uid()
));

CREATE POLICY "HR PMS can view all sub-period submissions"
ON public.sub_period_submissions FOR SELECT
USING (has_role(auth.uid(), 'hr_pms'::app_role));

-- RLS: Skip-level and HR PMS on kpi_observations
CREATE POLICY "Skip-level can view observations"
ON public.kpi_observations FOR SELECT
USING (EXISTS (
  SELECT 1 FROM kpis k JOIN profiles p ON k.employee_id = p.id
  WHERE k.id = kpi_observations.kpi_id
  AND get_skip_level_manager(p.id) = auth.uid()
));

CREATE POLICY "HR PMS can view all observations"
ON public.kpi_observations FOR SELECT
USING (has_role(auth.uid(), 'hr_pms'::app_role));

-- RLS: Skip-level and HR PMS on performance_reviews
CREATE POLICY "Skip-level managers can view reports reviews"
ON public.performance_reviews FOR SELECT
USING (EXISTS (
  SELECT 1 FROM profiles p
  WHERE p.id = performance_reviews.employee_id
  AND get_skip_level_manager(p.id) = auth.uid()
));

CREATE POLICY "HR PMS can view all reviews"
ON public.performance_reviews FOR SELECT
USING (has_role(auth.uid(), 'hr_pms'::app_role));

-- RLS: Skip-level and HR PMS on kpi_queries
CREATE POLICY "Skip-level managers can view reports queries"
ON public.kpi_queries FOR SELECT
USING (EXISTS (
  SELECT 1 FROM kpis k JOIN profiles p ON k.employee_id = p.id
  WHERE k.id = kpi_queries.kpi_id
  AND get_skip_level_manager(p.id) = auth.uid()
));

CREATE POLICY "HR PMS can view all queries"
ON public.kpi_queries FOR SELECT
USING (has_role(auth.uid(), 'hr_pms'::app_role));
