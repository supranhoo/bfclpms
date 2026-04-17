ALTER TABLE public.incentive_production_rates DROP CONSTRAINT IF EXISTS incentive_production_rates_rate_type_check;
ALTER TABLE public.incentive_production_rates ADD CONSTRAINT incentive_production_rates_rate_type_check 
  CHECK (rate_type IN ('employee','department','bu','company','common'));