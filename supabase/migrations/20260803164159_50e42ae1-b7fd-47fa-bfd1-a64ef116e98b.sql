-- ADR-241 / POLICY §SEC-INACTIVE-SUPPRESSION
-- 1) Recipient activity helper
CREATE OR REPLACE FUNCTION public.notification_recipient_is_active(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT NOT EXISTS (
    SELECT 1 FROM public.profiles p
     WHERE p.id = p_user_id
       AND p.is_active = false
  );
$$;

REVOKE ALL ON FUNCTION public.notification_recipient_is_active(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.notification_recipient_is_active(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.notification_recipient_is_active(uuid) IS
'ADR-241: false when the recipient has a profile row flagged is_active = false. Profiles that do not exist are not blocked here (other guards cover them).';

-- 2) Central silent-skip guard covering SECURITY DEFINER producers
CREATE OR REPLACE FUNCTION public.block_notifications_for_inactive_recipient()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.user_id IS NULL THEN
    RETURN NULL;
  END IF;

  IF NOT public.notification_recipient_is_active(NEW.user_id) THEN
    -- Silently drop: notification delivery is best-effort and must never
    -- abort the business transaction that produced it (POLICY §108).
    RETURN NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notifications_skip_inactive ON public.notifications;
CREATE TRIGGER trg_notifications_skip_inactive
BEFORE INSERT ON public.notifications
FOR EACH ROW EXECUTE FUNCTION public.block_notifications_for_inactive_recipient();

-- 3) Fail fast for client-side inserts
DROP POLICY IF EXISTS "Notifications insert requires sender relationship" ON public.notifications;
CREATE POLICY "Notifications insert requires sender relationship"
ON public.notifications
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() IS NOT NULL
  AND user_id IS NOT NULL
  AND public.notification_recipient_is_active(user_id)
  AND public.can_send_notification_to(auth.uid(), user_id)
);

-- 4) Password reset gate (anti-enumeration, rate limited)
CREATE OR REPLACE FUNCTION public.password_reset_allowed(p_email text, p_client_ip text DEFAULT NULL::text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_allowed boolean := false;
  v_recent_attempts int;
BEGIN
  IF p_email IS NULL OR length(trim(p_email)) = 0 THEN
    RETURN false;
  END IF;

  IF p_client_ip IS NOT NULL THEN
    SELECT count(*) INTO v_recent_attempts
    FROM public.auth_lookup_attempts
    WHERE client_ip = p_client_ip
      AND attempted_at > now() - interval '1 minute';

    IF v_recent_attempts >= 10 THEN
      INSERT INTO public.auth_lookup_attempts(client_ip, succeeded) VALUES (p_client_ip, false);
      RETURN false;
    END IF;
  END IF;

  SELECT true INTO v_allowed
  FROM public.profiles p
  JOIN auth.users au ON au.id = p.id
  WHERE lower(au.email) = lower(trim(p_email))
    AND p.is_active = true
  LIMIT 1;

  IF p_client_ip IS NOT NULL THEN
    INSERT INTO public.auth_lookup_attempts(client_ip, succeeded)
    VALUES (p_client_ip, COALESCE(v_allowed, false));
  END IF;

  DELETE FROM public.auth_lookup_attempts WHERE attempted_at < now() - interval '1 hour';

  RETURN COALESCE(v_allowed, false);
END;
$$;

REVOKE ALL ON FUNCTION public.password_reset_allowed(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.password_reset_allowed(text, text) TO anon, authenticated, service_role;

COMMENT ON FUNCTION public.password_reset_allowed(text, text) IS
'ADR-241: returns true only for an existing, active account. Callers must show an identical UI for true/false to avoid account enumeration.';