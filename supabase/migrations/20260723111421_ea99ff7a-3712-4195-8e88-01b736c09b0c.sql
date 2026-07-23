
-- ADR-143: Break profiles self-update RLS recursion via SECURITY DEFINER snapshot helper.
--
-- The prior "Users can update their own profile" policy embedded ~14 inline
-- sub-selects of the form `SELECT p.X FROM profiles p WHERE p.id = auth.uid()`
-- inside its WITH CHECK. Postgres re-enters the profiles policy set to
-- evaluate those sub-selects, tripping the cycle detector and aborting every
-- UPDATE on profiles (admin-driven or self) with:
--   infinite recursion detected in policy for relation "profiles"
--
-- Fix: fetch the caller's locked-field snapshot once via a SECURITY DEFINER
-- helper (bypasses RLS by design) and compare column-by-column in the policy.

CREATE OR REPLACE FUNCTION public._self_profile_locked_snapshot()
RETURNS public.profiles
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.* FROM public.profiles p WHERE p.id = auth.uid();
$$;

REVOKE ALL ON FUNCTION public._self_profile_locked_snapshot() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public._self_profile_locked_snapshot() TO authenticated, service_role;

DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;

CREATE POLICY "Users can update their own profile"
ON public.profiles
FOR UPDATE
USING (auth.uid() = id)
WITH CHECK (
  auth.uid() = id
  AND (public._self_profile_locked_snapshot()).reporting_manager_id           IS NOT DISTINCT FROM reporting_manager_id
  AND (public._self_profile_locked_snapshot()).department_id                  IS NOT DISTINCT FROM department_id
  AND (public._self_profile_locked_snapshot()).pms_grade                      IS NOT DISTINCT FROM pms_grade
  AND (public._self_profile_locked_snapshot()).employment_status              IS NOT DISTINCT FROM employment_status
  AND (public._self_profile_locked_snapshot()).is_active                      IS NOT DISTINCT FROM is_active
  AND (public._self_profile_locked_snapshot()).portal_access                  IS NOT DISTINCT FROM portal_access
  AND (public._self_profile_locked_snapshot()).confirmation_increment_granted IS NOT DISTINCT FROM confirmation_increment_granted
  AND (public._self_profile_locked_snapshot()).company_id                     IS NOT DISTINCT FROM company_id
  AND (public._self_profile_locked_snapshot()).designation                    IS NOT DISTINCT FROM designation
  AND (public._self_profile_locked_snapshot()).employee_code                  IS NOT DISTINCT FROM employee_code
  AND (public._self_profile_locked_snapshot()).level_id                       IS NOT DISTINCT FROM level_id
  AND (public._self_profile_locked_snapshot()).location_id                    IS NOT DISTINCT FROM location_id
  AND (public._self_profile_locked_snapshot()).functional_manager_id          IS NOT DISTINCT FROM functional_manager_id
  AND (public._self_profile_locked_snapshot()).designated_proxy_user_id       IS NOT DISTINCT FROM designated_proxy_user_id
);
