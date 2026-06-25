
CREATE UNIQUE INDEX IF NOT EXISTS ux_profiles_email_ci
  ON public.profiles (lower(email))
  WHERE email IS NOT NULL;
