
-- Fix 1: Recreate the notify_on_query_resolved trigger function
-- Fire on ANY transition to 'resolved', not just 'open' -> 'resolved'
-- Skip send_back type queries
CREATE OR REPLACE FUNCTION public.notify_on_query_resolved()
RETURNS TRIGGER AS $$
BEGIN
  -- Only fire when status changes TO 'resolved'
  IF NEW.status = 'resolved' AND (OLD.status IS DISTINCT FROM 'resolved') THEN
    -- Skip send_back type queries (informational, not actionable)
    IF NEW.query_type = 'send_back' THEN
      RETURN NEW;
    END IF;

    -- Notify the query raiser that their query has been resolved
    INSERT INTO public.notifications (user_id, type, title, message, kpi_id, related_user_id, metadata)
    VALUES (
      NEW.raised_by,
      'query_resolved',
      'Query Resolved',
      COALESCE(NEW.resolution_notes, 'Your query has been resolved.'),
      NEW.kpi_id,
      NEW.raised_to,
      jsonb_build_object('query_id', NEW.id, 'resolution_notes', COALESCE(NEW.resolution_notes, ''))
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Recreate the trigger (drop first to ensure clean state)
DROP TRIGGER IF EXISTS trigger_notify_on_query_resolved ON public.kpi_queries;
CREATE TRIGGER trigger_notify_on_query_resolved
  AFTER UPDATE ON public.kpi_queries
  FOR EACH ROW
  WHEN (NEW.status = 'resolved')
  EXECUTE FUNCTION public.notify_on_query_resolved();

-- Fix 2: Delete spurious query_resolved notifications from the send-back backfill
-- These were created when the previous migration set send_back entries to resolved
DELETE FROM public.notifications
WHERE type = 'query_resolved'
  AND metadata->>'query_id' IS NOT NULL
  AND metadata->>'query_id' IN (
    SELECT id::text FROM public.kpi_queries WHERE query_type = 'send_back'
  );
