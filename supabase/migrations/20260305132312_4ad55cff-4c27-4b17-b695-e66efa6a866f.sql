
-- Disable ALL user triggers on kpis table
ALTER TABLE public.kpis DISABLE TRIGGER USER;

-- Fix Quarterly KPIs
WITH targets AS (
  SELECT k.id, k.employee_id, k.kra_name, k.kpi_name, k.review_year,
    CASE
      WHEN k.review_period IN ('January', 'February') THEN 'March'
      WHEN k.review_period IN ('April', 'May') THEN 'June'
      WHEN k.review_period IN ('July', 'August') THEN 'September'
      WHEN k.review_period IN ('October', 'November') THEN 'December'
    END AS target_period,
    ROW_NUMBER() OVER (
      PARTITION BY k.employee_id, k.kra_name, k.kpi_name, k.review_year,
        CASE
          WHEN k.review_period IN ('January', 'February') THEN 'March'
          WHEN k.review_period IN ('April', 'May') THEN 'June'
          WHEN k.review_period IN ('July', 'August') THEN 'September'
          WHEN k.review_period IN ('October', 'November') THEN 'December'
        END
      ORDER BY k.created_at DESC
    ) AS rn
  FROM public.kpis k
  WHERE k.frequency = 'Quarterly'
    AND k.review_period IN ('January', 'February', 'April', 'May', 'July', 'August', 'October', 'November')
),
to_update AS (
  SELECT t.id, t.target_period FROM targets t
  WHERE t.rn = 1
    AND NOT EXISTS (
      SELECT 1 FROM public.kpis dup
      WHERE dup.employee_id = t.employee_id
        AND dup.kra_name = t.kra_name
        AND dup.kpi_name = t.kpi_name
        AND dup.review_year = t.review_year
        AND dup.review_period = t.target_period
    )
)
UPDATE public.kpis k SET review_period = tu.target_period, updated_at = now()
FROM to_update tu WHERE k.id = tu.id;

-- Fix Bi-Monthly KPIs
WITH targets AS (
  SELECT k.id, k.employee_id, k.kra_name, k.kpi_name, k.review_year,
    CASE
      WHEN k.review_period = 'January' THEN 'February'
      WHEN k.review_period = 'March' THEN 'April'
      WHEN k.review_period = 'May' THEN 'June'
      WHEN k.review_period = 'July' THEN 'August'
      WHEN k.review_period = 'September' THEN 'October'
      WHEN k.review_period = 'November' THEN 'December'
    END AS target_period,
    ROW_NUMBER() OVER (
      PARTITION BY k.employee_id, k.kra_name, k.kpi_name, k.review_year,
        CASE
          WHEN k.review_period = 'January' THEN 'February'
          WHEN k.review_period = 'March' THEN 'April'
          WHEN k.review_period = 'May' THEN 'June'
          WHEN k.review_period = 'July' THEN 'August'
          WHEN k.review_period = 'September' THEN 'October'
          WHEN k.review_period = 'November' THEN 'December'
        END
      ORDER BY k.created_at DESC
    ) AS rn
  FROM public.kpis k
  WHERE k.frequency = 'Bi-Monthly'
    AND k.review_period IN ('January', 'March', 'May', 'July', 'September', 'November')
),
to_update AS (
  SELECT t.id, t.target_period FROM targets t
  WHERE t.rn = 1
    AND NOT EXISTS (
      SELECT 1 FROM public.kpis dup
      WHERE dup.employee_id = t.employee_id
        AND dup.kra_name = t.kra_name
        AND dup.kpi_name = t.kpi_name
        AND dup.review_year = t.review_year
        AND dup.review_period = t.target_period
    )
)
UPDATE public.kpis k SET review_period = tu.target_period, updated_at = now()
FROM to_update tu WHERE k.id = tu.id;

-- Fix Half-Yearly KPIs
WITH targets AS (
  SELECT k.id, k.employee_id, k.kra_name, k.kpi_name, k.review_year,
    CASE
      WHEN k.review_period IN ('January', 'February', 'March', 'April', 'May') THEN 'June'
      WHEN k.review_period IN ('July', 'August', 'September', 'October', 'November') THEN 'December'
    END AS target_period,
    ROW_NUMBER() OVER (
      PARTITION BY k.employee_id, k.kra_name, k.kpi_name, k.review_year,
        CASE
          WHEN k.review_period IN ('January', 'February', 'March', 'April', 'May') THEN 'June'
          WHEN k.review_period IN ('July', 'August', 'September', 'October', 'November') THEN 'December'
        END
      ORDER BY k.created_at DESC
    ) AS rn
  FROM public.kpis k
  WHERE k.frequency = 'Half-Yearly'
    AND k.review_period NOT IN ('June', 'December')
),
to_update AS (
  SELECT t.id, t.target_period FROM targets t
  WHERE t.rn = 1
    AND NOT EXISTS (
      SELECT 1 FROM public.kpis dup
      WHERE dup.employee_id = t.employee_id
        AND dup.kra_name = t.kra_name
        AND dup.kpi_name = t.kpi_name
        AND dup.review_year = t.review_year
        AND dup.review_period = t.target_period
    )
)
UPDATE public.kpis k SET review_period = tu.target_period, updated_at = now()
FROM to_update tu WHERE k.id = tu.id;

-- Re-enable ALL user triggers
ALTER TABLE public.kpis ENABLE TRIGGER USER;

-- Part 2: Enhanced trigger (INSERT + UPDATE)
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
BEGIN
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

DROP TRIGGER IF EXISTS kpi_frequency_lock_check ON public.kpis;
CREATE TRIGGER kpi_frequency_lock_check
  BEFORE INSERT OR UPDATE ON public.kpis
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_frequency_lock_on_submission();
