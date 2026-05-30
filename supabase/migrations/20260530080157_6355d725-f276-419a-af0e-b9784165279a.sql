-- Phase 19.1: Allow Safety admins to read active profiles for role-grant UX.
-- Without this, a Safety admin who is NOT a PMS admin sees an empty user
-- list on /safety/settings/users (search returns 0 rows regardless of input).
-- SELECT-only, scoped to active profiles, gated by has_safety_role(_, 'admin').

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy
    WHERE polname = 'Safety admins can view active profiles for role grants'
      AND polrelid = 'public.profiles'::regclass
  ) THEN
    CREATE POLICY "Safety admins can view active profiles for role grants"
    ON public.profiles
    FOR SELECT
    TO authenticated
    USING (
      is_active = true
      AND public.has_safety_role(auth.uid(), 'admin'::safety_app_role)
    );
  END IF;
END $$;