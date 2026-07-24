
ALTER TABLE public.annual_review_assignment_overrides
  DROP CONSTRAINT IF EXISTS annual_review_assignment_overrides_role_check;
ALTER TABLE public.annual_review_assignment_overrides
  ADD CONSTRAINT annual_review_assignment_overrides_role_check
  CHECK (role IN ('manager','skip_manager','dept_head','bu_head','hr','management'));
