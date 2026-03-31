
ALTER TABLE public.incentive_production_rates
  ADD COLUMN rate_type TEXT NOT NULL DEFAULT 'employee'
    CHECK (rate_type IN ('employee', 'department', 'bu', 'common')),
  ADD COLUMN entity_id UUID;

ALTER TABLE public.incentive_production_rates
  ALTER COLUMN employee_id DROP NOT NULL;

ALTER TABLE public.incentive_production_rates
  DROP CONSTRAINT IF EXISTS incentive_production_rates_program_id_employee_id_key;

ALTER TABLE public.incentive_production_rates
  ADD CONSTRAINT incentive_production_rates_unique_rate
    UNIQUE (program_id, rate_type, employee_id, entity_id);
