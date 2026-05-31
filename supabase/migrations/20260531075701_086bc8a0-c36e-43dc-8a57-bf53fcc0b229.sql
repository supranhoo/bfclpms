
ALTER TABLE public.general_eligibility_configs
  ADD COLUMN IF NOT EXISTS service_as_on_mode text NOT NULL DEFAULT 'run_date',
  ADD COLUMN IF NOT EXISTS service_as_on_date date;

ALTER TABLE public.general_eligibility_configs
  DROP CONSTRAINT IF EXISTS general_eligibility_service_as_on_mode_chk;
ALTER TABLE public.general_eligibility_configs
  ADD CONSTRAINT general_eligibility_service_as_on_mode_chk
  CHECK (service_as_on_mode IN ('run_date','ay_end','custom'));

CREATE OR REPLACE FUNCTION public.general_eligibility_validate_anchor()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.service_as_on_mode = 'custom' AND NEW.service_as_on_date IS NULL THEN
    RAISE EXCEPTION 'service_as_on_date is required when service_as_on_mode = custom';
  END IF;
  IF NEW.service_as_on_mode <> 'custom' THEN
    NEW.service_as_on_date := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_general_eligibility_validate_anchor ON public.general_eligibility_configs;
CREATE TRIGGER trg_general_eligibility_validate_anchor
BEFORE INSERT OR UPDATE ON public.general_eligibility_configs
FOR EACH ROW EXECUTE FUNCTION public.general_eligibility_validate_anchor();
