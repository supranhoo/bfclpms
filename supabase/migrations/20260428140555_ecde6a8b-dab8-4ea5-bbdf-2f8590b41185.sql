-- BUG-045: Make handle_new_user() idempotent so password-rollout can provision
-- backfilled employees (profile already exists with no auth.users row).
-- Without this guard, INSERT INTO public.profiles inside the trigger raises a
-- duplicate key error during auth.admin.createUser, which Supabase surfaces as
-- the generic "Database error creating new user".
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  -- Insert profile only if one does not already exist for this auth user id.
  -- For backfilled employees the profile is already authoritative (employee_code,
  -- department, reporting_manager, etc.) and MUST NOT be overwritten here.
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, NEW.raw_user_meta_data ->> 'full_name')
  ON CONFLICT (id) DO NOTHING;

  -- Assign default 'employee' role only if the user has no row for that role.
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'employee')
  ON CONFLICT (user_id, role) DO NOTHING;

  RETURN NEW;
END;
$$;