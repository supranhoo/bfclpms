REVOKE EXECUTE ON FUNCTION public.can_send_notification_to(uuid, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.can_send_notification_to(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_send_notification_to(uuid, uuid) TO authenticated, service_role;