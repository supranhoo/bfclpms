-- Add resubmission tracking to sub-period submissions
ALTER TABLE sub_period_submissions
ADD COLUMN is_resubmitted boolean DEFAULT false;