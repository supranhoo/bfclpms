
-- 1. Extend status enum
ALTER TYPE public.annual_review_status ADD VALUE IF NOT EXISTS 'excluded';

-- 2. Add exclusion metadata columns
ALTER TABLE public.annual_review_instances
  ADD COLUMN IF NOT EXISTS excluded_at timestamptz,
  ADD COLUMN IF NOT EXISTS excluded_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS excluded_reason text;

CREATE INDEX IF NOT EXISTS idx_ari_excluded_at ON public.annual_review_instances(excluded_at) WHERE excluded_at IS NOT NULL;
