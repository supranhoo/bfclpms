-- Add unique constraint on kpi_id for upsert functionality
ALTER TABLE public.review_submissions 
ADD CONSTRAINT review_submissions_kpi_id_unique UNIQUE (kpi_id);