-- Add effective_from to incentive_production_rates and replace unique constraint
ALTER TABLE public.incentive_production_rates
  ADD COLUMN IF NOT EXISTS effective_from DATE;

-- Backfill existing rows from created_at
UPDATE public.incentive_production_rates
  SET effective_from = COALESCE(effective_from, created_at::date, CURRENT_DATE)
  WHERE effective_from IS NULL;

ALTER TABLE public.incentive_production_rates
  ALTER COLUMN effective_from SET NOT NULL,
  ALTER COLUMN effective_from SET DEFAULT CURRENT_DATE;

-- Drop the old unique constraint (it was on program_id, rate_type, employee_id, entity_id)
DO $$
DECLARE
  cons_name text;
BEGIN
  SELECT conname INTO cons_name
  FROM pg_constraint
  WHERE conrelid = 'public.incentive_production_rates'::regclass
    AND contype = 'u'
    AND pg_get_constraintdef(oid) ILIKE '%program_id%rate_type%employee_id%entity_id%'
    AND pg_get_constraintdef(oid) NOT ILIKE '%effective_from%'
  LIMIT 1;

  IF cons_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.incentive_production_rates DROP CONSTRAINT %I', cons_name);
  END IF;
END $$;

-- New unique index treating NULL employee/entity as a single bucket per (program, type, date)
CREATE UNIQUE INDEX IF NOT EXISTS uniq_prod_rate_scope_date
  ON public.incentive_production_rates (
    program_id,
    rate_type,
    COALESCE(employee_id::text, ''),
    COALESCE(entity_id::text, ''),
    effective_from
  );

CREATE INDEX IF NOT EXISTS idx_prod_rate_program_date
  ON public.incentive_production_rates (program_id, effective_from DESC);