
ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS team_queue_default_scope text DEFAULT 'any',
  ADD COLUMN IF NOT EXISTS team_queue_allowed_scopes jsonb,
  ADD COLUMN IF NOT EXISTS team_queue_role_overrides jsonb,
  ADD COLUMN IF NOT EXISTS team_queue_allow_user_override boolean NOT NULL DEFAULT true;

ALTER TABLE public.app_settings
  DROP CONSTRAINT IF EXISTS app_settings_team_queue_default_scope_chk;
ALTER TABLE public.app_settings
  ADD CONSTRAINT app_settings_team_queue_default_scope_chk
  CHECK (team_queue_default_scope IS NULL OR team_queue_default_scope IN
    ('any','manager','skip','dept','bu','hr','management'));

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS team_queue_default_scope text;

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_team_queue_default_scope_chk;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_team_queue_default_scope_chk
  CHECK (team_queue_default_scope IS NULL OR team_queue_default_scope IN
    ('any','manager','skip','dept','bu','hr','management'));

-- RPC lets any authenticated user set only their own default without needing
-- broad UPDATE grants on profiles (which has many sensitive columns).
CREATE OR REPLACE FUNCTION public.set_my_team_queue_default_scope(p_scope text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'auth required';
  END IF;
  IF p_scope IS NOT NULL AND p_scope NOT IN ('any','manager','skip','dept','bu','hr','management') THEN
    RAISE EXCEPTION 'invalid scope %', p_scope;
  END IF;
  UPDATE public.profiles
     SET team_queue_default_scope = p_scope
   WHERE id = auth.uid();
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_my_team_queue_default_scope(text) TO authenticated;
