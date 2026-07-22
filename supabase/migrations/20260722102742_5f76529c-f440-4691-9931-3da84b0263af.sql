-- ADR-132 CAPA follow-up: explicit grants for the sender authorization SSOT.
REVOKE ALL ON FUNCTION public.can_send_notification_to(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.can_send_notification_to(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.can_send_notification_to(uuid, uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.can_send_notification_to(uuid, uuid) IS
  'Notification sender relationship SSOT. Anonymous execution is prohibited; see POLICY §108b/§108f and ADR-112/ADR-131/ADR-132.';