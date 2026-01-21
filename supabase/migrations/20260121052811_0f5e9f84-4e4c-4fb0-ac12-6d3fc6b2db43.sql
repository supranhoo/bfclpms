-- Enable pg_net extension for HTTP calls from database
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Create function to call email notification edge function
CREATE OR REPLACE FUNCTION public.send_email_on_notification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  recipient_email TEXT;
  recipient_name TEXT;
  kpi_record RECORD;
  actor_name TEXT;
  supabase_url TEXT;
  service_role_key TEXT;
BEGIN
  -- Get Supabase URL and service role key from vault or environment
  supabase_url := current_setting('app.settings.supabase_url', true);
  service_role_key := current_setting('app.settings.service_role_key', true);
  
  -- If settings not available, try to construct from known pattern
  IF supabase_url IS NULL THEN
    supabase_url := 'https://jdvsvqiyptijplyhmqqn.supabase.co';
  END IF;
  
  -- Get recipient email and name
  SELECT p.email, p.full_name INTO recipient_email, recipient_name
  FROM profiles p
  WHERE p.id = NEW.user_id;
  
  -- Skip if no email found
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
  
  -- Map notification type to email event type
  -- Call the edge function via pg_net
  PERFORM extensions.http_post(
    url := supabase_url || '/functions/v1/send-email-notification',
    body := jsonb_build_object(
      'event_type', NEW.type,
      'recipient_email', recipient_email,
      'recipient_name', COALESCE(recipient_name, 'User'),
      'kpi_name', kpi_record.kpi_name,
      'kra_name', kpi_record.kra_name,
      'actor_name', actor_name,
      'review_period', kpi_record.review_period,
      'review_year', kpi_record.review_year,
      'query_reason', NEW.metadata->>'query_reason',
      'resolution_notes', NEW.metadata->>'resolution_notes'
    )::text,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || COALESCE(service_role_key, current_setting('request.jwt.claim.sub', true))
    )::jsonb
  );
  
  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Log error but don't fail the notification insert
    RAISE WARNING 'Failed to send email notification: %', SQLERRM;
    RETURN NEW;
END;
$$;

-- Create trigger on notifications table
DROP TRIGGER IF EXISTS trigger_send_email_on_notification ON notifications;
CREATE TRIGGER trigger_send_email_on_notification
  AFTER INSERT ON notifications
  FOR EACH ROW
  EXECUTE FUNCTION send_email_on_notification();

-- Add comment for documentation
COMMENT ON FUNCTION send_email_on_notification() IS 'Automatically sends email notifications via edge function when in-app notifications are created';