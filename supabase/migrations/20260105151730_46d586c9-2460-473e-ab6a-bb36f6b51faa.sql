-- Insert new workflow template: Full 5-Stage Review (skips Manager Review)
INSERT INTO public.workflow_templates (
  name,
  display_name,
  description,
  stages,
  is_default
) VALUES (
  'skip_manager',
  'Full 5-Stage Review',
  'Complete review cycle with all stages except Manager Review. KRA Set → Self Review → Audit Review → Management Review → Approved',
  '["kra_set", "self_review", "audit", "management_review", "approved"]'::jsonb,
  false
);