CREATE OR REPLACE FUNCTION public.tg_annual_review_validate_enabled_stages()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $function$
DECLARE v_bad int;
BEGIN
  IF NEW.enabled_stages IS NULL OR jsonb_typeof(NEW.enabled_stages) <> 'array' THEN
    RAISE EXCEPTION 'enabled_stages must be a JSON array';
  END IF;
  IF NOT (NEW.enabled_stages ? 'self') THEN
    RAISE EXCEPTION 'enabled_stages must contain "self"';
  END IF;
  SELECT count(*) INTO v_bad
    FROM jsonb_array_elements_text(NEW.enabled_stages) x
   WHERE x NOT IN ('self','manager','skip_manager','dept_head','bu_head','hr','management');
  IF v_bad > 0 THEN
    RAISE EXCEPTION 'enabled_stages contains unknown stage';
  END IF;
  RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION public.tg_annual_review_validate_default_enabled_stages()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $function$
DECLARE v_bad int;
BEGIN
  IF NEW.default_enabled_stages IS NULL OR jsonb_typeof(NEW.default_enabled_stages) <> 'array' THEN
    RAISE EXCEPTION 'default_enabled_stages must be a JSON array';
  END IF;
  IF NOT (NEW.default_enabled_stages ? 'self') THEN
    RAISE EXCEPTION 'default_enabled_stages must contain "self"';
  END IF;
  SELECT count(*) INTO v_bad
    FROM jsonb_array_elements_text(NEW.default_enabled_stages) x
   WHERE x NOT IN ('self','manager','skip_manager','dept_head','bu_head','hr','management');
  IF v_bad > 0 THEN
    RAISE EXCEPTION 'default_enabled_stages contains unknown stage';
  END IF;
  RETURN NEW;
END $function$;