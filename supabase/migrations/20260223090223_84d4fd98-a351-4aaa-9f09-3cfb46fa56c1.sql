-- Add evidence_urls JSONB column to sub_period_submissions
ALTER TABLE public.sub_period_submissions
ADD COLUMN evidence_urls jsonb DEFAULT '[]'::jsonb;