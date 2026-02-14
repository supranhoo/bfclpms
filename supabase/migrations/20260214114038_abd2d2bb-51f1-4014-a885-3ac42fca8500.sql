
ALTER TABLE public.app_settings
ADD COLUMN IF NOT EXISTS pms_policy_visible_roles jsonb
DEFAULT '["admin","manager","employee","auditor","management","hr_pms"]'::jsonb;

-- Update existing row
UPDATE public.app_settings
SET pms_policy_visible_roles = '["admin","manager","employee","auditor","management","hr_pms"]'::jsonb
WHERE pms_policy_visible_roles IS NULL;
