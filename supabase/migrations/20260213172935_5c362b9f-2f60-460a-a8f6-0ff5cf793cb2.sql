
-- Phase 1b: Add new KPI status enum values
ALTER TYPE review_status ADD VALUE IF NOT EXISTS 'skip_level_check';
ALTER TYPE review_status ADD VALUE IF NOT EXISTS 'hr_pms_review';

-- Phase 1c: Add hr_pms to app_role enum
ALTER TYPE app_role ADD VALUE IF NOT EXISTS 'hr_pms';
