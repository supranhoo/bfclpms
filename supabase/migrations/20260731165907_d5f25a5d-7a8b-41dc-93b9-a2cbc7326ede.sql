ALTER TABLE public.annual_review_bell_curve_config
  ADD COLUMN IF NOT EXISTS exempted_slab_cap_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS exempted_top_tiers_excluded integer NOT NULL DEFAULT 2;

ALTER TABLE public.annual_review_bell_curve_config
  DROP CONSTRAINT IF EXISTS annual_review_bell_curve_config_exempted_tiers_chk;

ALTER TABLE public.annual_review_bell_curve_config
  ADD CONSTRAINT annual_review_bell_curve_config_exempted_tiers_chk
  CHECK (exempted_top_tiers_excluded >= 0 AND exempted_top_tiers_excluded <= 6);