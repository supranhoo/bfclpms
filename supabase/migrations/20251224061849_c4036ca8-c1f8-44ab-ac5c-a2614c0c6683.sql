-- 1. Create trigger to auto-reset kpi_status when query is resolved
CREATE OR REPLACE FUNCTION public.handle_query_resolution()
RETURNS TRIGGER AS $$
BEGIN
  -- When query status changes from 'open' to 'resolved'
  IF OLD.status = 'open' AND NEW.status = 'resolved' THEN
    -- Reset the kpi_status back to 'submitted' so manager can re-review
    UPDATE public.review_submissions
    SET kpi_status = 'submitted', updated_at = now()
    WHERE kpi_id = NEW.kpi_id 
      AND kpi_status = 'approved_by_manager';
    
    -- Log the automatic status reset
    INSERT INTO public.kpi_audit_logs (kpi_id, action, performed_by, new_value, metadata)
    VALUES (
      NEW.kpi_id, 
      'QUERY_RESOLVED_AUTO_RESET', 
      NEW.raised_to,
      jsonb_build_object('kpi_status', 'submitted'),
      jsonb_build_object('query_id', NEW.id, 'resolution_notes', NEW.resolution_notes)
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_query_resolution
  AFTER UPDATE ON public.kpi_queries
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_query_resolution();

-- 2. Create trigger to sync kpis.status based on submission actions
CREATE OR REPLACE FUNCTION public.sync_kpi_status_from_submission()
RETURNS TRIGGER AS $$
BEGIN
  -- When kpi_status changes to 'approved_by_manager', check if all KPIs for employee in period are approved
  -- Then move to manager_check status on kpis table
  IF NEW.kpi_status = 'approved_by_manager' AND (OLD.kpi_status IS NULL OR OLD.kpi_status != 'approved_by_manager') THEN
    UPDATE public.kpis
    SET status = 'manager_check', updated_at = now()
    WHERE id = NEW.kpi_id
      AND status = 'self_review';
  END IF;
  
  -- When kpi_status changes to 'locked', move KPI to audit status
  IF NEW.kpi_status = 'locked' AND (OLD.kpi_status IS NULL OR OLD.kpi_status != 'locked') THEN
    UPDATE public.kpis
    SET status = 'audit', updated_at = now()
    WHERE id = NEW.kpi_id
      AND status = 'manager_check';
  END IF;
  
  -- When submission is first created with self rating, ensure KPI moves to self_review
  IF NEW.self_rating IS NOT NULL AND (OLD.self_rating IS NULL) THEN
    UPDATE public.kpis
    SET status = 'self_review', updated_at = now()
    WHERE id = NEW.kpi_id
      AND status = 'kra_set';
      
    -- Update kpi_status to submitted
    NEW.kpi_status := 'submitted';
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_submission_status_change
  BEFORE UPDATE ON public.review_submissions
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_kpi_status_from_submission();

-- 3. Create trigger to log all KPI status transitions
CREATE OR REPLACE FUNCTION public.log_kpi_status_transition()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO public.kpi_audit_logs (kpi_id, action, performed_by, old_value, new_value, metadata)
    VALUES (
      NEW.id,
      'STATUS_TRANSITION',
      COALESCE(auth.uid(), NEW.employee_id),
      jsonb_build_object('status', OLD.status),
      jsonb_build_object('status', NEW.status),
      jsonb_build_object('transition_time', now())
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_kpi_status_change
  AFTER UPDATE ON public.kpis
  FOR EACH ROW
  EXECUTE FUNCTION public.log_kpi_status_transition();

-- 4. Add review_periods table for period locking functionality
CREATE TABLE IF NOT EXISTS public.review_periods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  period_name TEXT NOT NULL,
  review_year INTEGER NOT NULL,
  start_date DATE,
  end_date DATE,
  is_locked BOOLEAN NOT NULL DEFAULT false,
  locked_at TIMESTAMPTZ,
  locked_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(period_name, review_year)
);

-- Enable RLS on review_periods
ALTER TABLE public.review_periods ENABLE ROW LEVEL SECURITY;

-- Policies for review_periods
CREATE POLICY "Admins can manage review_periods"
  ON public.review_periods FOR ALL
  USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Authenticated users can view review_periods"
  ON public.review_periods FOR SELECT
  USING (true);

-- 5. Create function to check if period is locked
CREATE OR REPLACE FUNCTION public.is_period_locked(_period_name TEXT, _review_year INTEGER)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT is_locked FROM public.review_periods 
     WHERE period_name = _period_name AND review_year = _review_year),
    false
  )
$$;

-- 6. Create trigger to prevent updates on locked period KPIs
CREATE OR REPLACE FUNCTION public.prevent_locked_period_updates()
RETURNS TRIGGER AS $$
BEGIN
  -- Check if the period is locked
  IF public.is_period_locked(NEW.review_period, NEW.review_year) THEN
    -- Allow only admins to modify locked period KPIs
    IF NOT public.has_role(auth.uid(), 'admin') THEN
      RAISE EXCEPTION 'This review period is locked. Contact admin for changes.';
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER check_period_lock_on_kpi_update
  BEFORE UPDATE ON public.kpis
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_locked_period_updates();

-- 7. Create trigger to prevent submission updates on locked periods
CREATE OR REPLACE FUNCTION public.prevent_locked_submission_updates()
RETURNS TRIGGER AS $$
DECLARE
  v_period TEXT;
  v_year INTEGER;
BEGIN
  -- Get period info from the KPI
  SELECT review_period, review_year INTO v_period, v_year
  FROM public.kpis WHERE id = NEW.kpi_id;
  
  -- Check if the period is locked
  IF public.is_period_locked(v_period, v_year) THEN
    -- Allow only admins to modify locked period submissions
    IF NOT public.has_role(auth.uid(), 'admin') THEN
      RAISE EXCEPTION 'This review period is locked. Contact admin for changes.';
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER check_period_lock_on_submission_update
  BEFORE UPDATE ON public.review_submissions
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_locked_submission_updates();