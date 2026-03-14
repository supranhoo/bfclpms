CREATE OR REPLACE FUNCTION public.prevent_locked_period_updates()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_has_prior_submission boolean;
BEGIN
  -- Legacy lock
  IF public.is_period_locked(NEW.review_period, NEW.review_year) THEN
    IF NOT public.has_role(auth.uid(), 'admin') THEN
      RAISE EXCEPTION 'This review period is locked. Contact admin for changes.';
    END IF;
  END IF;

  -- BYPASS: Variance acknowledgment is admin metadata, not a KPI edit
  IF OLD.weightage_variance_acknowledged IS DISTINCT FROM NEW.weightage_variance_acknowledged
     AND OLD.weightage IS NOT DISTINCT FROM NEW.weightage
     AND OLD.status IS NOT DISTINCT FROM NEW.status
     AND OLD.kpi_name IS NOT DISTINCT FROM NEW.kpi_name
     AND OLD.target_value IS NOT DISTINCT FROM NEW.target_value
  THEN
    RETURN NEW;
  END IF;

  -- BYPASS: Daily KPIs at kra_set can transition to self_review
  IF NEW.frequency = 'Daily' AND OLD.status = 'kra_set' AND NEW.status = 'self_review' THEN
    RETURN NEW;
  END IF;

  -- BYPASS: Sent-back KPIs (kra_set with prior submission) can resubmit
  IF OLD.status = 'kra_set' AND NEW.status = 'self_review' THEN
    SELECT EXISTS(SELECT 1 FROM review_submissions WHERE kpi_id = NEW.id)
      INTO v_has_prior_submission;
    IF v_has_prior_submission THEN
      RETURN NEW;
    END IF;
  END IF;

  -- Standard governance check
  IF NOT public.check_review_period_permission(auth.uid(), NEW.review_period, NEW.review_year, 'edit_kpi') THEN
    RAISE EXCEPTION 'You do not have permission to modify KPIs in this review period.';
  END IF;

  RETURN NEW;
END;
$$;