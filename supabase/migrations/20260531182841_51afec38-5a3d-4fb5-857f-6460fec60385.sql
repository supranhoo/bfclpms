ALTER TABLE public.increment_method_configs
  ADD COLUMN IF NOT EXISTS joining_month_cutoff_day SMALLINT;

ALTER TABLE public.increment_method_configs
  DROP CONSTRAINT IF EXISTS increment_method_configs_joining_month_cutoff_day_chk;

ALTER TABLE public.increment_method_configs
  ADD CONSTRAINT increment_method_configs_joining_month_cutoff_day_chk
  CHECK (joining_month_cutoff_day IS NULL OR (joining_month_cutoff_day BETWEEN 1 AND 31));

COMMENT ON COLUMN public.increment_method_configs.joining_month_cutoff_day IS
  'Day-of-month cutoff (1-31) for counting the DOJ month under method=prorated_doj. If DOJ day < cutoff the joining month is counted; if >= it is excluded. NULL = engine default (15). Only meaningful when method = prorated_doj.';