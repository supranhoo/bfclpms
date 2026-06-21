-- Annual review: add Department Head stage to the canonical chain.
-- Enum values must be added in their own migration before any function/column references them.
ALTER TYPE public.annual_reviewer_role ADD VALUE IF NOT EXISTS 'dept_head' AFTER 'skip_manager';
ALTER TYPE public.annual_review_status  ADD VALUE IF NOT EXISTS 'pending_dept' AFTER 'pending_skip';