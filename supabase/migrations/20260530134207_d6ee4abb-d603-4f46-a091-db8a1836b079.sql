
BEGIN;

-- Drop FKs (Postgres doesn't support array FKs)
ALTER TABLE public.increment_eligibility_configs
  DROP CONSTRAINT IF EXISTS increment_eligibility_configs_company_id_fkey,
  DROP CONSTRAINT IF EXISTS increment_eligibility_configs_division_id_fkey,
  DROP CONSTRAINT IF EXISTS increment_eligibility_configs_business_unit_id_fkey,
  DROP CONSTRAINT IF EXISTS increment_eligibility_configs_level_id_fkey,
  DROP CONSTRAINT IF EXISTS increment_eligibility_configs_category_id_fkey,
  DROP CONSTRAINT IF EXISTS increment_eligibility_configs_location_id_fkey;

-- Drop the old expression-based unique index
DROP INDEX IF EXISTS public.uq_increment_eligibility_configs_scope;
DROP INDEX IF EXISTS public.increment_eligibility_configs_scope_year_unique;
ALTER TABLE public.increment_eligibility_configs
  DROP CONSTRAINT IF EXISTS increment_eligibility_configs_scope_year_unique;

-- Convert scope columns to uuid[]
ALTER TABLE public.increment_eligibility_configs
  ALTER COLUMN company_id       DROP DEFAULT,
  ALTER COLUMN company_id       TYPE uuid[] USING (CASE WHEN company_id       IS NULL THEN ARRAY[]::uuid[] ELSE ARRAY[company_id]       END),
  ALTER COLUMN company_id       SET DEFAULT '{}'::uuid[],
  ALTER COLUMN company_id       SET NOT NULL;

ALTER TABLE public.increment_eligibility_configs
  ALTER COLUMN division_id      DROP DEFAULT,
  ALTER COLUMN division_id      TYPE uuid[] USING (CASE WHEN division_id      IS NULL THEN ARRAY[]::uuid[] ELSE ARRAY[division_id]      END),
  ALTER COLUMN division_id      SET DEFAULT '{}'::uuid[],
  ALTER COLUMN division_id      SET NOT NULL;

ALTER TABLE public.increment_eligibility_configs
  ALTER COLUMN business_unit_id DROP DEFAULT,
  ALTER COLUMN business_unit_id TYPE uuid[] USING (CASE WHEN business_unit_id IS NULL THEN ARRAY[]::uuid[] ELSE ARRAY[business_unit_id] END),
  ALTER COLUMN business_unit_id SET DEFAULT '{}'::uuid[],
  ALTER COLUMN business_unit_id SET NOT NULL;

ALTER TABLE public.increment_eligibility_configs
  ALTER COLUMN level_id         DROP DEFAULT,
  ALTER COLUMN level_id         TYPE uuid[] USING (CASE WHEN level_id         IS NULL THEN ARRAY[]::uuid[] ELSE ARRAY[level_id]         END),
  ALTER COLUMN level_id         SET DEFAULT '{}'::uuid[],
  ALTER COLUMN level_id         SET NOT NULL;

ALTER TABLE public.increment_eligibility_configs
  ALTER COLUMN category_id      DROP DEFAULT,
  ALTER COLUMN category_id      TYPE uuid[] USING (CASE WHEN category_id      IS NULL THEN ARRAY[]::uuid[] ELSE ARRAY[category_id]      END),
  ALTER COLUMN category_id      SET DEFAULT '{}'::uuid[],
  ALTER COLUMN category_id      SET NOT NULL;

ALTER TABLE public.increment_eligibility_configs
  ALTER COLUMN location_id      DROP DEFAULT,
  ALTER COLUMN location_id      TYPE uuid[] USING (CASE WHEN location_id      IS NULL THEN ARRAY[]::uuid[] ELSE ARRAY[location_id]      END),
  ALTER COLUMN location_id      SET DEFAULT '{}'::uuid[],
  ALTER COLUMN location_id      SET NOT NULL;

CREATE OR REPLACE FUNCTION public.normalize_increment_eligibility_scope()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.company_id       IS NULL THEN NEW.company_id       := '{}'::uuid[]; END IF;
  IF NEW.division_id      IS NULL THEN NEW.division_id      := '{}'::uuid[]; END IF;
  IF NEW.business_unit_id IS NULL THEN NEW.business_unit_id := '{}'::uuid[]; END IF;
  IF NEW.level_id         IS NULL THEN NEW.level_id         := '{}'::uuid[]; END IF;
  IF NEW.category_id      IS NULL THEN NEW.category_id      := '{}'::uuid[]; END IF;
  IF NEW.location_id      IS NULL THEN NEW.location_id      := '{}'::uuid[]; END IF;

  NEW.company_id       := ARRAY(SELECT DISTINCT x FROM unnest(NEW.company_id)       AS x ORDER BY x);
  NEW.division_id      := ARRAY(SELECT DISTINCT x FROM unnest(NEW.division_id)      AS x ORDER BY x);
  NEW.business_unit_id := ARRAY(SELECT DISTINCT x FROM unnest(NEW.business_unit_id) AS x ORDER BY x);
  NEW.level_id         := ARRAY(SELECT DISTINCT x FROM unnest(NEW.level_id)         AS x ORDER BY x);
  NEW.category_id      := ARRAY(SELECT DISTINCT x FROM unnest(NEW.category_id)      AS x ORDER BY x);
  NEW.location_id      := ARRAY(SELECT DISTINCT x FROM unnest(NEW.location_id)      AS x ORDER BY x);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_increment_eligibility_scope ON public.increment_eligibility_configs;
CREATE TRIGGER trg_normalize_increment_eligibility_scope
  BEFORE INSERT OR UPDATE ON public.increment_eligibility_configs
  FOR EACH ROW
  EXECUTE FUNCTION public.normalize_increment_eligibility_scope();

CREATE UNIQUE INDEX increment_eligibility_configs_scope_year_unique
  ON public.increment_eligibility_configs (
    assessment_year, company_id, division_id, business_unit_id, level_id, category_id, location_id
  );

COMMIT;
