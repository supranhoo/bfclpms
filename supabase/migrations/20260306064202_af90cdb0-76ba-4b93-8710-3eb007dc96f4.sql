
-- Update prevent_locked_period_updates to use governance system
CREATE OR REPLACE FUNCTION public.prevent_locked_period_updates()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
BEGIN
  -- First check legacy is_period_locked
  IF public.is_period_locked(NEW.review_period, NEW.review_year) THEN
    IF NOT public.has_role(auth.uid(), 'admin') THEN
      RAISE EXCEPTION 'This review period is locked. Contact admin for changes.';
    END IF;
  END IF;
  
  -- Then check governance permission (edit_kpi covers KPI modifications)
  IF NOT public.check_review_period_permission(auth.uid(), NEW.review_period, NEW.review_year, 'edit_kpi') THEN
    RAISE EXCEPTION 'You do not have permission to modify KPIs in this review period.';
  END IF;
  
  RETURN NEW;
END;
$$;

-- Update prevent_locked_submission_updates to use governance system
CREATE OR REPLACE FUNCTION public.prevent_locked_submission_updates()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE
  v_period TEXT;
  v_year INTEGER;
BEGIN
  SELECT review_period, review_year INTO v_period, v_year
  FROM public.kpis WHERE id = NEW.kpi_id;
  
  -- Legacy check
  IF public.is_period_locked(v_period, v_year) THEN
    IF NOT public.has_role(auth.uid(), 'admin') THEN
      RAISE EXCEPTION 'This review period is locked. Contact admin for changes.';
    END IF;
  END IF;
  
  -- Governance check
  IF NOT public.check_review_period_permission(auth.uid(), v_period, v_year, 'edit_scores') THEN
    RAISE EXCEPTION 'You do not have permission to modify submissions in this review period.';
  END IF;
  
  RETURN NEW;
END;
$$;

-- Trigger to create audit log + notification when stage changes on review_periods
CREATE OR REPLACE FUNCTION public.notify_on_stage_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE
  v_stage TEXT;
BEGIN
  v_stage := NEW.current_stage;
  
  -- Only fire when current_stage actually changes
  IF OLD.current_stage IS DISTINCT FROM NEW.current_stage THEN
    -- Notify all employees who have KPIs in this period
    INSERT INTO public.notifications (user_id, type, title, message, metadata)
    SELECT DISTINCT
      k.employee_id,
      'period_stage_changed',
      'Review Period Stage Changed',
      'The review period ' || NEW.period_name || ' ' || NEW.review_year || ' has moved to: ' || v_stage,
      jsonb_build_object(
        'review_period', NEW.period_name,
        'review_year', NEW.review_year,
        'old_stage', OLD.current_stage,
        'new_stage', NEW.current_stage
      )
    FROM public.kpis k
    WHERE k.review_period = NEW.period_name
      AND k.review_year = NEW.review_year;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create the trigger (drop first if exists)
DROP TRIGGER IF EXISTS trg_notify_stage_change ON public.review_periods;
CREATE TRIGGER trg_notify_stage_change
  AFTER UPDATE ON public.review_periods
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_on_stage_change();
