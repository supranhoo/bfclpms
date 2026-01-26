-- Migration: Update notification trigger to include employee name + Add PMS policy URL column

-- 1. Add pms_policy_url column to app_settings
ALTER TABLE public.app_settings ADD COLUMN IF NOT EXISTS pms_policy_url TEXT;

-- 2. Update notify_on_kpi_status_change trigger to include employee name and code
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
  -- Get KPI details
  SELECT employee_id, kpi_name, kra_name INTO v_employee_id, v_kpi_name, v_kra_name
  FROM public.kpis WHERE id = NEW.id;
  
  -- Get employee details (name and code)
  SELECT full_name, employee_code, reporting_manager_id 
  INTO v_employee_name, v_employee_code, v_manager_id
  FROM public.profiles WHERE id = v_employee_id;
  
  -- Build employee display string: "Name (Code)" or just "Name" if no code
  v_employee_display := COALESCE(v_employee_name, 'Employee');
  IF v_employee_code IS NOT NULL AND v_employee_code != '' THEN
    v_employee_display := v_employee_display || ' (' || v_employee_code || ')';
  END IF;
  
  -- Notify based on status transition
  IF OLD.status = 'kra_set' AND NEW.status = 'self_review' THEN
    -- Employee submitted self-review -> Notify manager
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
    
  ELSIF OLD.status = 'self_review' AND NEW.status = 'manager_check' THEN
    -- Manager approved -> Notify employee and auditors
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
    
    -- Notify all auditors
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
    
  ELSIF OLD.status = 'manager_check' AND NEW.status = 'audit' THEN
    -- Auditor approved -> Notify employee
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
    
    -- Notify management
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
    
  ELSIF NEW.status = 'approved' THEN
    -- Final approval -> Notify employee
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