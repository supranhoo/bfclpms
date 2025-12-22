-- Add is_na flag to review_submissions for marking KPIs as Not Applicable
ALTER TABLE public.review_submissions ADD COLUMN is_na BOOLEAN NOT NULL DEFAULT FALSE;