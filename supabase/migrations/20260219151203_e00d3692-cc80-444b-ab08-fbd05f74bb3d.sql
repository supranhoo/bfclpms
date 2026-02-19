-- ============================================================
-- Frequency Lock Enforcement Trigger
-- Blocks kra_set → self_review status transitions for non-admin
-- users when the KPI's review_period month is locked per the
-- frequency_config table.
-- ============================================================

CREATE OR REPLACE FUNCTION public.enforce_frequency_lock_on_submission()
RETURNS TRIGGER AS $$
DECLARE
  locked_config jsonb;
  month_num int;
  is_admin boolean;
BEGIN
  -- Only enforce on the kra_set → self_review transition
  IF OLD.status = 'kra_set' AND NEW.status = 'self_review' THEN

    -- Admins bypass the lock entirely
    SELECT public.has_role(auth.uid(), 'admin'::public.app_role) INTO is_admin;
    IF is_admin THEN RETURN NEW; END IF;

    -- Only applies to multi-month frequencies
    IF NEW.frequency NOT IN ('Bi-Monthly', 'Quarterly', 'Half-Yearly', 'Yearly') THEN
      RETURN NEW;
    END IF;

    -- Fetch the locked_months config for this frequency
    SELECT locked_months INTO locked_config
    FROM public.frequency_config
    WHERE frequency = NEW.frequency
    LIMIT 1;

    -- If no config found, allow the transition (fail open)
    IF locked_config IS NULL THEN RETURN NEW; END IF;

    -- review_period must be set to check
    IF NEW.review_period IS NULL THEN RETURN NEW; END IF;

    -- Derive month number from review_period name (e.g., 'January' → 1)
    BEGIN
      month_num := EXTRACT(MONTH FROM TO_DATE(NEW.review_period || ' 1 2000', 'Month DD YYYY'))::int;
    EXCEPTION WHEN OTHERS THEN
      -- If we can't parse the month, fail open
      RETURN NEW;
    END;

    -- Check if month_num appears in any locked group in the jsonb object
    IF EXISTS (
      SELECT 1
      FROM jsonb_each(locked_config) AS e(key, val)
      WHERE jsonb_typeof(val) = 'array'
        AND val @> to_jsonb(month_num)
    ) THEN
      RAISE EXCEPTION 'Submission not allowed: % KPI is locked for %. Entry opens in the active review month of the cycle.',
        NEW.frequency, NEW.review_period;
    END IF;

  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Attach the trigger to the kpis table
DROP TRIGGER IF EXISTS kpi_frequency_lock_check ON public.kpis;

CREATE TRIGGER kpi_frequency_lock_check
  BEFORE UPDATE ON public.kpis
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_frequency_lock_on_submission();
