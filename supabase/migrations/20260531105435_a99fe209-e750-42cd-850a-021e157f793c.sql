-- Add transition gating + multi-company scope to confirmation_increment_rules
ALTER TABLE public.confirmation_increment_rules
  ADD COLUMN IF NOT EXISTS applicable_transitions text[] NOT NULL DEFAULT ARRAY['trainee_to_confirmed']::text[],
  ADD COLUMN IF NOT EXISTS company_scope_mode text NOT NULL DEFAULT 'global',
  ADD COLUMN IF NOT EXISTS selected_company_ids uuid[] NOT NULL DEFAULT '{}'::uuid[];

ALTER TABLE public.confirmation_increment_rules
  DROP CONSTRAINT IF EXISTS confirmation_increment_rules_company_scope_mode_check;
ALTER TABLE public.confirmation_increment_rules
  ADD CONSTRAINT confirmation_increment_rules_company_scope_mode_check
  CHECK (company_scope_mode IN ('global','selected','per_company'));

-- Capture pre-confirmation employment status on profiles (nullable; safe default)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS previous_employment_status text NULL;