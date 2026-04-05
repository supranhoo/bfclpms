
-- Enhanced enforce_frequency_lock_on_submission trigger
-- Part 2: Block ALL transitions on sibling months + date-based cycle completion for terminal months
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
  v_cycle_end date;
  v_months text[] := ARRAY['January','February','March','April','May','June','July','August','September','October','November','December'];
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

  -- Parse month number from review_period
  BEGIN
    month_num := array_position(v_months, NEW.review_period);
    IF month_num IS NULL THEN
      month_num := EXTRACT(MONTH FROM TO_DATE(NEW.review_period || ' 1 2000', 'Month DD YYYY'))::int;
    END IF;
  EXCEPTION WHEN OTHERS THEN RETURN NEW;
  END;

  SELECT locked_months INTO locked_config
  FROM public.frequency_config WHERE frequency = NEW.frequency LIMIT 1;

  IF locked_config IS NULL THEN RETURN NEW; END IF;

  -- CHECK 1: Block ALL transitions (not just kra_set→self_review) for sibling (locked) months
  IF EXISTS (
    SELECT 1 FROM jsonb_each(locked_config) AS e(key, val)
    WHERE jsonb_typeof(val) = 'array' AND val @> to_jsonb(month_num)
  ) THEN
    IF TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status) THEN
      RAISE EXCEPTION 'Submission not allowed: % KPI cannot be reviewed for %. Only the terminal month of the cycle is reviewable.',
        NEW.frequency, NEW.review_period;
    END IF;
  END IF;

  -- CHECK 2: For terminal months, block kra_set→self_review if cycle hasn't ended yet
  IF TG_OP = 'UPDATE' AND OLD.status = 'kra_set' AND NEW.status = 'self_review' THEN
    -- Terminal month = not in locked months. Compute end of that month.
    v_cycle_end := (make_date(NEW.review_year, month_num, 1) + interval '1 month' - interval '1 day')::date;
    
    IF CURRENT_DATE <= v_cycle_end THEN
      RAISE EXCEPTION 'Cycle not yet complete: % KPI for % % can only be reviewed after %. Please wait until the cycle ends.',
        NEW.frequency, NEW.review_period, NEW.review_year, v_cycle_end;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;
