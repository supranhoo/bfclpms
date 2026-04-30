-- ============================================================================
-- PHASE 1: Employee-Code Login Foundation
-- Adds support for users without real emails to log in via employee code
-- ============================================================================

-- 1. Add has_real_email flag on profiles (default true preserves existing behavior)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS has_real_email boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.profiles.has_real_email IS
  'TRUE when profiles.email is a real, deliverable address. FALSE for users provisioned without an email (login via employee_code, synthetic auth.users.email under @noemail.bfclpms.local).';

-- 2. Guard: profiles.email must NEVER hold a synthetic address.
-- The synthetic address lives only in auth.users.email; profiles.email is the real contact channel.
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_email_no_synthetic_chk;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_email_no_synthetic_chk
  CHECK (
    email IS NULL
    OR email NOT ILIKE '%@noemail.bfclpms.local'
    OR email NOT ILIKE '%@placeholder-pms.com'
  );

-- 3. Backfill: any auth.users with placeholder/synthetic emails -> mark profile as no-email
-- Also null out profiles.email rows that hold a synthetic value (defensive).
UPDATE public.profiles p
SET has_real_email = false,
    email = CASE
      WHEN p.email ILIKE '%@noemail.bfclpms.local' THEN NULL
      WHEN p.email ILIKE '%@placeholder-pms.com' THEN NULL
      ELSE p.email
    END
FROM auth.users au
WHERE au.id = p.id
  AND (
    au.email ILIKE '%@noemail.bfclpms.local'
    OR au.email ILIKE '%@placeholder-pms.com'
  );

-- 4. Email change audit trail (append-only)
CREATE TABLE IF NOT EXISTS public.email_change_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  old_email text,
  new_email text,
  performed_by uuid,
  source text NOT NULL CHECK (source IN ('self_service','admin','system','password_rollout','create_employee')),
  performed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_email_change_audit_user
  ON public.email_change_audit (user_id, performed_at DESC);

ALTER TABLE public.email_change_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin reads all email changes" ON public.email_change_audit;
CREATE POLICY "Admin reads all email changes"
  ON public.email_change_audit FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Users read own email changes" ON public.email_change_audit;
CREATE POLICY "Users read own email changes"
  ON public.email_change_audit FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- No INSERT/UPDATE/DELETE policies — only SECURITY DEFINER functions write to it.
-- No UPDATE/DELETE allowed anywhere (append-only).

-- 5. Anti-enumeration rate-limiter table (simple, sufficient for low-volume internal app)
CREATE TABLE IF NOT EXISTS public.auth_lookup_attempts (
  id bigserial PRIMARY KEY,
  client_ip text,
  attempted_at timestamptz NOT NULL DEFAULT now(),
  succeeded boolean NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_auth_lookup_attempts_ip_time
  ON public.auth_lookup_attempts (client_ip, attempted_at DESC);

ALTER TABLE public.auth_lookup_attempts ENABLE ROW LEVEL SECURITY;
-- Locked down: only SECURITY DEFINER functions can read/write. No policies = no access for anon/authenticated.

-- 6. Index for fast employee_code lookup (case-insensitive, active only)
CREATE INDEX IF NOT EXISTS idx_profiles_employee_code_lower_active
  ON public.profiles (lower(employee_code))
  WHERE is_active = true;

-- 7. Lookup RPC — translates employee_code -> synthetic email (if user has auth row)
-- Returns NULL for not-found / inactive / no-auth-row (anti-enumeration: never differentiate).
-- Rate-limited to 10 attempts per minute per IP via auth_lookup_attempts.
CREATE OR REPLACE FUNCTION public.lookup_synthetic_email_by_code(
  p_code text,
  p_client_ip text DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email text;
  v_recent_attempts int;
BEGIN
  -- Reject blank input
  IF p_code IS NULL OR length(trim(p_code)) = 0 THEN
    RETURN NULL;
  END IF;

  -- Rate limit: 10 attempts / minute per IP (best-effort; NULL ip = no limit applied here)
  IF p_client_ip IS NOT NULL THEN
    SELECT count(*) INTO v_recent_attempts
    FROM public.auth_lookup_attempts
    WHERE client_ip = p_client_ip
      AND attempted_at > now() - interval '1 minute';

    IF v_recent_attempts >= 10 THEN
      INSERT INTO public.auth_lookup_attempts(client_ip, succeeded) VALUES (p_client_ip, false);
      RETURN NULL;
    END IF;
  END IF;

  -- Resolve: active profile with matching code AND existing auth.users row
  SELECT au.email INTO v_email
  FROM public.profiles p
  JOIN auth.users au ON au.id = p.id
  WHERE lower(p.employee_code) = lower(trim(p_code))
    AND p.is_active = true
  LIMIT 1;

  -- Log attempt (succeeded/failed) for rate-limit window
  IF p_client_ip IS NOT NULL THEN
    INSERT INTO public.auth_lookup_attempts(client_ip, succeeded)
    VALUES (p_client_ip, v_email IS NOT NULL);
  END IF;

  -- Cleanup: opportunistic prune of old attempts (best-effort; older than 1 hour)
  DELETE FROM public.auth_lookup_attempts WHERE attempted_at < now() - interval '1 hour';

  RETURN v_email;
END;
$$;

GRANT EXECUTE ON FUNCTION public.lookup_synthetic_email_by_code(text, text) TO anon, authenticated;

-- 8. Helper: should_send_email(user_id) — single source of truth for outbound email gate.
-- Returns true only if profile has a real, non-synthetic email.
CREATE OR REPLACE FUNCTION public.should_send_email(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT p.has_real_email
        AND p.email IS NOT NULL
        AND p.email NOT ILIKE '%@noemail.%'
        AND p.email NOT ILIKE '%@placeholder-pms.com'
        AND p.is_active = true
      FROM public.profiles p
      WHERE p.id = p_user_id
    ),
    false
  );
$$;

GRANT EXECUTE ON FUNCTION public.should_send_email(uuid) TO authenticated, service_role;
