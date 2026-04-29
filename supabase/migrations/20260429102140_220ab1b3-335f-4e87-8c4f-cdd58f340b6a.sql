
ALTER PUBLICATION supabase_realtime ADD TABLE public.safety_notifications;
ALTER TABLE public.safety_notifications REPLICA IDENTITY FULL;
