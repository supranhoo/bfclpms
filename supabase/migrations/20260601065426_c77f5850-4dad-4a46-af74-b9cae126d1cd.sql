ALTER TABLE public.increment_method_configs
  ADD COLUMN IF NOT EXISTS eligibility_cutoff_month smallint
    CHECK (eligibility_cutoff_month BETWEEN 1 AND 12),
  ADD COLUMN IF NOT EXISTS eligibility_cutoff_day smallint
    CHECK (eligibility_cutoff_day BETWEEN 1 AND 31),
  ADD COLUMN IF NOT EXISTS carry_forward_post_cutoff boolean NOT NULL DEFAULT false;

ALTER TABLE public.increment_run_items
  ADD COLUMN IF NOT EXISTS post_cutoff_joiner boolean,
  ADD COLUMN IF NOT EXISTS post_cutoff_carry_forward_months smallint;