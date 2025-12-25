-- Add evidence URL columns for manager, auditor, and management reviews
ALTER TABLE public.review_submissions 
ADD COLUMN IF NOT EXISTS manager_evidence_url TEXT,
ADD COLUMN IF NOT EXISTS auditor_evidence_url TEXT,
ADD COLUMN IF NOT EXISTS management_evidence_url TEXT;