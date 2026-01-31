-- Phase 1: Add 'responded' status to query_status enum
ALTER TYPE public.query_status ADD VALUE IF NOT EXISTS 'responded';

-- Phase 5: Update notification trigger to handle two-step resolution
CREATE OR REPLACE FUNCTION public.notify_on_query_resolved()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_kpi_name TEXT;
  v_responder_name TEXT;
  v_responder_code TEXT;
  v_responder_display TEXT;
  v_raiser_name TEXT;
  v_manager_id UUID;
BEGIN
  -- Get KPI name
  SELECT kpi_name INTO v_kpi_name FROM public.kpis WHERE id = NEW.kpi_id;
  
  -- Get responder (raised_to) details
  SELECT full_name, employee_code, reporting_manager_id 
  INTO v_responder_name, v_responder_code, v_manager_id
  FROM public.profiles WHERE id = NEW.raised_to;
  
  -- Build responder display string: "Name (Code)" or just "Name"
  v_responder_display := COALESCE(v_responder_name, 'Employee');
  IF v_responder_code IS NOT NULL AND v_responder_code != '' THEN
    v_responder_display := v_responder_display || ' (' || v_responder_code || ')';
  END IF;
  
  -- Get raiser name
  SELECT COALESCE(full_name, email) INTO v_raiser_name
  FROM public.profiles WHERE id = NEW.raised_by;
  
  -- ============================================================
  -- CASE 1: Employee responds (open → responded)
  -- Notify the query raiser that a response was submitted
  -- ============================================================
  IF OLD.status = 'open' AND NEW.status = 'responded' THEN
    -- Notify the query raiser
    INSERT INTO public.notifications (user_id, type, title, message, kpi_id, related_user_id, metadata)
    VALUES (
      NEW.raised_by,
      'query_response_submitted',
      'Query Response Received',
      v_responder_display || ' responded to your query on KPI: ' || v_kpi_name,
      NEW.kpi_id,
      NEW.raised_to,
      jsonb_build_object(
        'query_id', NEW.id, 
        'resolution_notes', NEW.resolution_notes,
        'responder_name', v_responder_name,
        'responder_code', v_responder_code
      )
    );
    
    -- Also notify intermediate manager (FYI) if exists and is not the raiser
    IF v_manager_id IS NOT NULL AND v_manager_id != NEW.raised_by THEN
      INSERT INTO public.notifications (user_id, type, title, message, kpi_id, related_user_id, metadata)
      VALUES (
        v_manager_id,
        'query_response_fyi',
        'Team Member Responded to Query',
        v_responder_display || ' responded to a query on KPI: ' || v_kpi_name,
        NEW.kpi_id,
        NEW.raised_to,
        jsonb_build_object(
          'query_id', NEW.id,
          'resolution_notes', NEW.resolution_notes,
          'is_fyi', true,
          'responder_name', v_responder_name
        )
      );
    END IF;
  END IF;
  
  -- ============================================================
  -- CASE 2: Raiser accepts response (responded → resolved)
  -- Notify the responder that their response was accepted
  -- ============================================================
  IF OLD.status = 'responded' AND NEW.status = 'resolved' THEN
    -- Notify the employee that their response was accepted
    INSERT INTO public.notifications (user_id, type, title, message, kpi_id, related_user_id, metadata)
    VALUES (
      NEW.raised_to,
      'query_resolved',
      'Query Response Accepted',
      v_raiser_name || ' accepted your response on KPI: ' || v_kpi_name,
      NEW.kpi_id,
      NEW.raised_by,
      jsonb_build_object('query_id', NEW.id, 'resolution_notes', NEW.resolution_notes)
    );
    
    -- Also notify intermediate manager (FYI) if exists and is not the raiser
    IF v_manager_id IS NOT NULL AND v_manager_id != NEW.raised_by THEN
      INSERT INTO public.notifications (user_id, type, title, message, kpi_id, related_user_id, metadata)
      VALUES (
        v_manager_id,
        'query_resolved_fyi',
        'Team Member Query Resolved',
        'Query resolved for ' || v_responder_display || ' on KPI: ' || v_kpi_name,
        NEW.kpi_id,
        NEW.raised_to,
        jsonb_build_object(
          'query_id', NEW.id,
          'is_fyi', true
        )
      );
    END IF;
  END IF;
  
  -- ============================================================
  -- CASE 3: Direct resolution (open → resolved) - backward compatibility
  -- Keep existing behavior for any direct resolutions
  -- ============================================================
  IF OLD.status = 'open' AND NEW.status = 'resolved' THEN
    INSERT INTO public.notifications (user_id, type, title, message, kpi_id, related_user_id, metadata)
    VALUES (
      NEW.raised_by,
      'query_resolved',
      'Query Resolved',
      v_responder_display || ' resolved your query on KPI: ' || v_kpi_name,
      NEW.kpi_id,
      NEW.raised_to,
      jsonb_build_object('query_id', NEW.id, 'resolution_notes', NEW.resolution_notes)
    );
  END IF;
  
  RETURN NEW;
END;
$$;