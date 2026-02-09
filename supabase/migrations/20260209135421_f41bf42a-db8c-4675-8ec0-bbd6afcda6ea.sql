
-- ============================================================
-- Step 1: Fix type mapping in send_email_on_notification trigger
-- Maps internal notification types to email template event types
-- ============================================================
CREATE OR REPLACE FUNCTION public.send_email_on_notification()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  recipient_email TEXT;
  recipient_name TEXT;
  kpi_record RECORD;
  actor_name TEXT;
  supabase_url TEXT;
  service_role_key TEXT;
  mapped_event_type TEXT;
BEGIN
  -- Get Supabase URL and service role key
  supabase_url := current_setting('app.settings.supabase_url', true);
  service_role_key := current_setting('app.settings.service_role_key', true);
  
  IF supabase_url IS NULL THEN
    supabase_url := 'https://jdvsvqiyptijplyhmqqn.supabase.co';
  END IF;
  
  -- Get recipient email and name
  SELECT p.email, p.full_name INTO recipient_email, recipient_name
  FROM profiles p
  WHERE p.id = NEW.user_id;
  
  IF recipient_email IS NULL THEN
    RETURN NEW;
  END IF;
  
  -- Get actor name if available
  IF NEW.related_user_id IS NOT NULL THEN
    SELECT p.full_name INTO actor_name
    FROM profiles p
    WHERE p.id = NEW.related_user_id;
  END IF;
  
  -- Get KPI details if available
  IF NEW.kpi_id IS NOT NULL THEN
    SELECT k.kra_name, k.kpi_name, k.review_period, k.review_year
    INTO kpi_record
    FROM kpis k
    WHERE k.id = NEW.kpi_id;
  END IF;
  
  -- ============================================================
  -- Map internal notification types to email template event types
  -- This preserves in-app notification display while ensuring
  -- emails use the correct template keys
  -- ============================================================
  CASE NEW.type
    WHEN 'kpi_approved' THEN
      -- Check metadata.stage to distinguish manager vs auditor approval
      IF NEW.metadata->>'stage' = 'auditor' THEN
        mapped_event_type := 'manager_approved'; -- reuse template for auditor approval too
      ELSE
        mapped_event_type := 'manager_approved';
      END IF;
    WHEN 'kpi_finalized' THEN
      mapped_event_type := 'final_approved';
    WHEN 'kpi_ready_for_audit' THEN
      mapped_event_type := 'kpi_ready_for_audit';
    WHEN 'kpi_ready_for_management' THEN
      mapped_event_type := 'kpi_ready_for_management';
    WHEN 'query_response_submitted' THEN
      mapped_event_type := 'query_response_received';
    WHEN 'query_response_fyi' THEN
      mapped_event_type := 'query_response_received';
    WHEN 'query_resolved_fyi' THEN
      mapped_event_type := 'query_resolved';
    WHEN 'admin_status_change' THEN
      mapped_event_type := 'admin_status_change';
    WHEN 'admin_data_entry' THEN
      mapped_event_type := 'admin_data_entry';
    WHEN 'admin_data_override' THEN
      mapped_event_type := 'admin_data_override';
    WHEN 'org_kpi_sent_back' THEN
      mapped_event_type := 'org_kpi_sent_back';
    ELSE
      -- For types that already match (kpi_submitted, query_raised, query_resolved,
      -- kra_assigned, period_locked, pip_initiated, pip_completed, pip_milestone_reminder,
      -- manager_rejected), pass through as-is
      mapped_event_type := NEW.type;
  END CASE;
  
  -- Call the edge function via http_post
  PERFORM extensions.http_post(
    url := supabase_url || '/functions/v1/send-email-notification',
    body := jsonb_build_object(
      'event_type', mapped_event_type,
      'recipient_email', recipient_email,
      'recipient_name', COALESCE(recipient_name, 'User'),
      'kpi_name', kpi_record.kpi_name,
      'kra_name', kpi_record.kra_name,
      'actor_name', actor_name,
      'review_period', kpi_record.review_period,
      'review_year', kpi_record.review_year,
      'query_reason', NEW.metadata->>'query_reason',
      'resolution_notes', NEW.metadata->>'resolution_notes',
      'pip_start_date', NEW.metadata->>'pip_start_date',
      'pip_end_date', NEW.metadata->>'pip_end_date',
      'pip_reason', NEW.metadata->>'pip_reason',
      'pip_outcome', NEW.metadata->>'pip_outcome',
      'pip_remarks', NEW.metadata->>'pip_remarks',
      'milestone_date', NEW.metadata->>'milestone_date',
      'milestone_description', NEW.metadata->>'milestone_description',
      'milestone_expected_outcome', NEW.metadata->>'milestone_expected_outcome',
      'send_back_reason', NEW.metadata->>'send_back_reason'
    )::text,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || COALESCE(service_role_key, current_setting('request.jwt.claim.sub', true))
    )::jsonb
  );
  
  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Failed to send email notification: %', SQLERRM;
    RETURN NEW;
END;
$function$;

-- ============================================================
-- Step 2a: Add send-back (manager_rejected) notification
-- Fires when KPI status moves backward to kra_set
-- ============================================================
CREATE OR REPLACE FUNCTION public.notify_on_kpi_status_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_employee_id UUID;
  v_manager_id UUID;
  v_kpi_name TEXT;
  v_kra_name TEXT;
  v_employee_name TEXT;
  v_employee_code TEXT;
  v_employee_display TEXT;
BEGIN
  SELECT employee_id, kpi_name, kra_name INTO v_employee_id, v_kpi_name, v_kra_name
  FROM public.kpis WHERE id = NEW.id;
  
  SELECT full_name, employee_code, reporting_manager_id 
  INTO v_employee_name, v_employee_code, v_manager_id
  FROM public.profiles WHERE id = v_employee_id;
  
  v_employee_display := COALESCE(v_employee_name, 'Employee');
  IF v_employee_code IS NOT NULL AND v_employee_code != '' THEN
    v_employee_display := v_employee_display || ' (' || v_employee_code || ')';
  END IF;
  
  -- ============================================================
  -- CASE 0: Send-back (any status → kra_set) — manager_rejected
  -- Notify the employee that their KPI was sent back
  -- ============================================================
  IF NEW.status = 'kra_set' AND OLD.status IN ('self_review', 'manager_check', 'audit', 'management_review') THEN
    INSERT INTO public.notifications (user_id, type, title, message, kpi_id, related_user_id, metadata)
    VALUES (
      v_employee_id,
      'manager_rejected',
      'KPI Sent Back for Revision',
      'Your KPI has been sent back for revision: ' || v_kpi_name,
      NEW.id,
      auth.uid(),
      jsonb_build_object('kra_name', v_kra_name, 'from_status', OLD.status, 'to_status', NEW.status)
    );
  END IF;
  
  -- ============================================================
  -- CASE 1: Self-review submission → Notify manager
  -- ============================================================
  IF OLD.status = 'kra_set' AND (NEW.status = 'self_review' OR NEW.status = 'manager_check') THEN
    IF v_manager_id IS NOT NULL THEN
      INSERT INTO public.notifications (user_id, type, title, message, kpi_id, related_user_id, metadata)
      VALUES (
        v_manager_id,
        'kpi_submitted',
        'Self Review Submitted',
        v_employee_display || ' submitted self-review for KPI: ' || v_kpi_name,
        NEW.id,
        v_employee_id,
        jsonb_build_object('kra_name', v_kra_name, 'from_status', OLD.status, 'to_status', NEW.status, 'employee_name', v_employee_name, 'employee_code', v_employee_code)
      );
    END IF;
    
  -- ============================================================
  -- CASE 2: Manager approved → Notify employee + auditors
  -- ============================================================
  ELSIF OLD.status = 'self_review' AND NEW.status = 'manager_check' THEN
    INSERT INTO public.notifications (user_id, type, title, message, kpi_id, related_user_id, metadata)
    VALUES (
      v_employee_id,
      'kpi_approved',
      'KPI Approved by Manager',
      'Your KPI has been approved by manager: ' || v_kpi_name,
      NEW.id,
      auth.uid(),
      jsonb_build_object('kra_name', v_kra_name, 'stage', 'manager')
    );
    
    INSERT INTO public.notifications (user_id, type, title, message, kpi_id, related_user_id, metadata)
    SELECT 
      ur.user_id,
      'kpi_ready_for_audit',
      'KPI Ready for Audit',
      v_employee_display || '''s KPI is ready for audit review: ' || v_kpi_name,
      NEW.id,
      v_employee_id,
      jsonb_build_object('kra_name', v_kra_name, 'employee_name', v_employee_name, 'employee_code', v_employee_code)
    FROM public.user_roles ur
    WHERE ur.role = 'auditor';
    
  -- ============================================================
  -- CASE 3: Auditor forwarded → Notify employee + management
  -- ============================================================
  ELSIF (OLD.status = 'manager_check' AND NEW.status = 'audit') OR
        (OLD.status = 'manager_check' AND NEW.status = 'management_review') THEN
    INSERT INTO public.notifications (user_id, type, title, message, kpi_id, related_user_id, metadata)
    VALUES (
      v_employee_id,
      'kpi_approved',
      'KPI Approved by Auditor',
      'Your KPI has been approved by auditor: ' || v_kpi_name,
      NEW.id,
      auth.uid(),
      jsonb_build_object('kra_name', v_kra_name, 'stage', 'auditor')
    );
    
    INSERT INTO public.notifications (user_id, type, title, message, kpi_id, related_user_id, metadata)
    SELECT 
      ur.user_id,
      'kpi_ready_for_management',
      'KPI Ready for Management Review',
      v_employee_display || '''s KPI is ready for management review: ' || v_kpi_name,
      NEW.id,
      v_employee_id,
      jsonb_build_object('kra_name', v_kra_name, 'employee_name', v_employee_name, 'employee_code', v_employee_code)
    FROM public.user_roles ur
    WHERE ur.role = 'management';
    
  -- ============================================================
  -- CASE 4: Audit stage → management
  -- ============================================================
  ELSIF OLD.status = 'audit' AND NEW.status = 'management_review' THEN
    INSERT INTO public.notifications (user_id, type, title, message, kpi_id, related_user_id, metadata)
    VALUES (
      v_employee_id,
      'kpi_approved',
      'KPI Approved by Auditor',
      'Your KPI has been approved by auditor: ' || v_kpi_name,
      NEW.id,
      auth.uid(),
      jsonb_build_object('kra_name', v_kra_name, 'stage', 'auditor')
    );
    
    INSERT INTO public.notifications (user_id, type, title, message, kpi_id, related_user_id, metadata)
    SELECT 
      ur.user_id,
      'kpi_ready_for_management',
      'KPI Ready for Management Review',
      v_employee_display || '''s KPI is ready for management review: ' || v_kpi_name,
      NEW.id,
      v_employee_id,
      jsonb_build_object('kra_name', v_kra_name, 'employee_name', v_employee_name, 'employee_code', v_employee_code)
    FROM public.user_roles ur
    WHERE ur.role = 'management';
    
  -- ============================================================
  -- CASE 5: Management approved → Notify employee (final)
  -- ============================================================
  ELSIF NEW.status = 'approved' AND (OLD.status = 'audit' OR OLD.status = 'management_review') THEN
    INSERT INTO public.notifications (user_id, type, title, message, kpi_id, related_user_id, metadata)
    VALUES (
      v_employee_id,
      'kpi_finalized',
      'KPI Finalized',
      'Your KPI has been finalized: ' || v_kpi_name,
      NEW.id,
      auth.uid(),
      jsonb_build_object('kra_name', v_kra_name)
    );
  END IF;
  
  RETURN NEW;
END;
$function$;

-- ============================================================
-- Step 2b: Add KRA assigned notification trigger
-- Fires when a new KPI is inserted
-- ============================================================
CREATE OR REPLACE FUNCTION public.notify_on_kpi_created()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_employee_name TEXT;
BEGIN
  SELECT full_name INTO v_employee_name FROM public.profiles WHERE id = NEW.employee_id;
  
  INSERT INTO public.notifications (user_id, type, title, message, kpi_id, metadata)
  VALUES (
    NEW.employee_id,
    'kra_assigned',
    'New KRA Assigned',
    'A new KPI has been assigned to you: ' || NEW.kpi_name,
    NEW.id,
    jsonb_build_object(
      'kra_name', NEW.kra_name,
      'kpi_name', NEW.kpi_name,
      'review_period', NEW.review_period,
      'review_year', NEW.review_year
    )
  );
  
  RETURN NEW;
END;
$function$;

-- Create the trigger for KPI creation
DROP TRIGGER IF EXISTS trigger_notify_kpi_created ON public.kpis;
CREATE TRIGGER trigger_notify_kpi_created
  AFTER INSERT ON public.kpis
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_on_kpi_created();

-- ============================================================
-- Step 2c: Add period locked notification trigger
-- Fires when review_periods.is_locked changes to true
-- ============================================================
CREATE OR REPLACE FUNCTION public.notify_on_period_locked()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Only fire when period becomes locked
  IF NEW.is_locked = true AND (OLD.is_locked = false OR OLD.is_locked IS NULL) THEN
    -- Notify all employees who have KPIs in this period
    INSERT INTO public.notifications (user_id, type, title, message, metadata)
    SELECT DISTINCT
      k.employee_id,
      'period_locked',
      'Review Period Locked',
      'The review period ' || NEW.period_name || ' ' || NEW.review_year || ' has been locked.',
      jsonb_build_object(
        'review_period', NEW.period_name,
        'review_year', NEW.review_year,
        'locked_by', auth.uid()
      )
    FROM public.kpis k
    WHERE k.review_period = NEW.period_name
      AND k.review_year = NEW.review_year;
  END IF;
  
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trigger_notify_period_locked ON public.review_periods;
CREATE TRIGGER trigger_notify_period_locked
  AFTER UPDATE ON public.review_periods
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_on_period_locked();
