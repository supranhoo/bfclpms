ALTER TABLE public.increment_run_items
  ADD COLUMN IF NOT EXISTS confirmation_treatment public.confirmation_increment_treatment,
  ADD COLUMN IF NOT EXISTS confirmation_granted boolean,
  ADD COLUMN IF NOT EXISTS confirmation_effective_date date,
  ADD COLUMN IF NOT EXISTS period_covered_months numeric(6,2),
  ADD COLUMN IF NOT EXISTS balance_eligible_months numeric(6,2),
  ADD COLUMN IF NOT EXISTS carry_forward_months numeric(6,2),
  ADD COLUMN IF NOT EXISTS final_eligible_months numeric(6,2),
  ADD COLUMN IF NOT EXISTS adjustment_reason text;