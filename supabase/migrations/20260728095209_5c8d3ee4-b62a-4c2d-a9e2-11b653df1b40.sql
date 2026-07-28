REVOKE EXECUTE ON FUNCTION public.can_send_notification_to(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.can_send_notification_to(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.can_send_notification_to(uuid, uuid, jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.can_send_notification_to(uuid, uuid, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_observation_participant(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_observation_participant(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_send_notification_to(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_send_notification_to(uuid, uuid, jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_observation_participant(uuid, uuid) TO authenticated, service_role;