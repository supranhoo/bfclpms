-- Create notifications table for workflow events
CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type TEXT NOT NULL, -- 'kpi_submitted', 'kpi_approved', 'kpi_sent_back', 'query_raised', 'query_resolved'
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  kpi_id UUID REFERENCES public.kpis(id) ON DELETE CASCADE,
  related_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL, -- The user who triggered the notification
  is_read BOOLEAN NOT NULL DEFAULT false,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Users can only view their own notifications
CREATE POLICY "Users can view own notifications"
ON public.notifications FOR SELECT
USING (user_id = auth.uid());

-- Users can update (mark as read) their own notifications
CREATE POLICY "Users can update own notifications"
ON public.notifications FOR UPDATE
USING (user_id = auth.uid());

-- System can insert notifications (via triggers or service role)
CREATE POLICY "System can insert notifications"
ON public.notifications FOR INSERT
WITH CHECK (true);

-- Index for efficient queries
CREATE INDEX idx_notifications_user_unread ON public.notifications(user_id, is_read, created_at DESC);

-- Function to create notifications when KPI status changes
CREATE OR REPLACE FUNCTION public.notify_on_kpi_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_employee_id UUID;
  v_manager_id UUID;
  v_kpi_name TEXT;
  v_kra_name TEXT;
  v_actor_name TEXT;
BEGIN
  -- Get KPI details
  SELECT employee_id, kpi_name, kra_name INTO v_employee_id, v_kpi_name, v_kra_name
  FROM public.kpis WHERE id = NEW.id;
  
  -- Get manager ID
  SELECT reporting_manager_id INTO v_manager_id
  FROM public.profiles WHERE id = v_employee_id;
  
  -- Get actor name (the person who made the change)
  SELECT COALESCE(full_name, email) INTO v_actor_name
  FROM public.profiles WHERE id = auth.uid();
  
  -- Notify based on status transition
  IF OLD.status = 'kra_set' AND NEW.status = 'self_review' THEN
    -- Employee submitted self-review -> Notify manager
    IF v_manager_id IS NOT NULL THEN
      INSERT INTO public.notifications (user_id, type, title, message, kpi_id, related_user_id, metadata)
      VALUES (
        v_manager_id,
        'kpi_submitted',
        'Self Review Submitted',
        'Employee submitted self-review for KPI: ' || v_kpi_name,
        NEW.id,
        v_employee_id,
        jsonb_build_object('kra_name', v_kra_name, 'from_status', OLD.status, 'to_status', NEW.status)
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
      'A KPI is ready for audit review: ' || v_kpi_name,
      NEW.id,
      v_employee_id,
      jsonb_build_object('kra_name', v_kra_name)
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
      'A KPI is ready for management review: ' || v_kpi_name,
      NEW.id,
      v_employee_id,
      jsonb_build_object('kra_name', v_kra_name)
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
$$;

-- Create trigger for KPI status changes
DROP TRIGGER IF EXISTS notify_kpi_status_change ON public.kpis;
CREATE TRIGGER notify_kpi_status_change
AFTER UPDATE OF status ON public.kpis
FOR EACH ROW
WHEN (OLD.status IS DISTINCT FROM NEW.status)
EXECUTE FUNCTION public.notify_on_kpi_status_change();

-- Function to create notification when query is raised
CREATE OR REPLACE FUNCTION public.notify_on_query_raised()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_kpi_name TEXT;
  v_raiser_name TEXT;
BEGIN
  -- Get KPI name
  SELECT kpi_name INTO v_kpi_name FROM public.kpis WHERE id = NEW.kpi_id;
  
  -- Get raiser name
  SELECT COALESCE(full_name, email) INTO v_raiser_name
  FROM public.profiles WHERE id = NEW.raised_by;
  
  -- Create notification for the recipient
  INSERT INTO public.notifications (user_id, type, title, message, kpi_id, related_user_id, metadata)
  VALUES (
    NEW.raised_to,
    'query_raised',
    'New Query Raised',
    v_raiser_name || ' raised a query on KPI: ' || v_kpi_name,
    NEW.kpi_id,
    NEW.raised_by,
    jsonb_build_object('query_id', NEW.id, 'reason', NEW.reason)
  );
  
  RETURN NEW;
END;
$$;

-- Create trigger for new queries
DROP TRIGGER IF EXISTS notify_query_raised ON public.kpi_queries;
CREATE TRIGGER notify_query_raised
AFTER INSERT ON public.kpi_queries
FOR EACH ROW
EXECUTE FUNCTION public.notify_on_query_raised();

-- Function to notify when query is resolved
CREATE OR REPLACE FUNCTION public.notify_on_query_resolved()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_kpi_name TEXT;
  v_resolver_name TEXT;
BEGIN
  IF OLD.status = 'open' AND NEW.status = 'resolved' THEN
    -- Get KPI name
    SELECT kpi_name INTO v_kpi_name FROM public.kpis WHERE id = NEW.kpi_id;
    
    -- Get resolver name
    SELECT COALESCE(full_name, email) INTO v_resolver_name
    FROM public.profiles WHERE id = NEW.raised_to;
    
    -- Notify the person who raised the query
    INSERT INTO public.notifications (user_id, type, title, message, kpi_id, related_user_id, metadata)
    VALUES (
      NEW.raised_by,
      'query_resolved',
      'Query Resolved',
      v_resolver_name || ' resolved your query on KPI: ' || v_kpi_name,
      NEW.kpi_id,
      NEW.raised_to,
      jsonb_build_object('query_id', NEW.id, 'resolution_notes', NEW.resolution_notes)
    );
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger for query resolution
DROP TRIGGER IF EXISTS notify_query_resolved ON public.kpi_queries;
CREATE TRIGGER notify_query_resolved
AFTER UPDATE OF status ON public.kpi_queries
FOR EACH ROW
WHEN (OLD.status = 'open' AND NEW.status = 'resolved')
EXECUTE FUNCTION public.notify_on_query_resolved();

-- Enable realtime for notifications
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;