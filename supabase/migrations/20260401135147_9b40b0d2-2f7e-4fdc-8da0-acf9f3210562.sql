
-- Use a more reliable bypass: check if the calling context has a specific temp table
CREATE OR REPLACE FUNCTION public.enforce_frequency_lock_on_submission()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  locked_config jsonb;
  month_num int;
  is_admin boolean;
  v_bypass boolean := false;
BEGIN
  -- Allow service_role to bypass
  IF current_setting('role', true) = 'service_role' THEN RETURN NEW; END IF;

  -- Allow percolation bypass via session variable (transaction-local)
  BEGIN
    IF current_setting('app.percolation_bypass', true) = 'true' THEN
      RETURN NEW;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    -- Setting doesn't exist, continue normally
  END;

  SELECT public.has_role(auth.uid(), 'admin'::public.app_role) INTO is_admin;
  IF is_admin THEN RETURN NEW; END IF;

  IF NEW.frequency NOT IN ('Bi-Monthly', 'Quarterly', 'Half-Yearly', 'Yearly') THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND OLD.status = 'kra_set' AND NEW.status = 'self_review') THEN
    SELECT locked_months INTO locked_config
    FROM public.frequency_config WHERE frequency = NEW.frequency LIMIT 1;

    IF locked_config IS NULL THEN RETURN NEW; END IF;
    IF NEW.review_period IS NULL THEN RETURN NEW; END IF;

    BEGIN
      month_num := EXTRACT(MONTH FROM TO_DATE(NEW.review_period || ' 1 2000', 'Month DD YYYY'))::int;
    EXCEPTION WHEN OTHERS THEN RETURN NEW;
    END;

    IF EXISTS (
      SELECT 1 FROM jsonb_each(locked_config) AS e(key, val)
      WHERE jsonb_typeof(val) = 'array' AND val @> to_jsonb(month_num)
    ) THEN
      RAISE EXCEPTION 'Submission not allowed: % KPI cannot have review_period = %. Use the terminal month of the cycle.',
        NEW.frequency, NEW.review_period;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;
