-- Add 'management_review' to review_status enum
ALTER TYPE public.review_status ADD VALUE IF NOT EXISTS 'management_review';