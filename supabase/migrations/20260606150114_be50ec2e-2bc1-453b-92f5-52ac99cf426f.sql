
-- has_menu_right: SSOT for profile-based menu rights in RLS policies.
-- SECURITY DEFINER so it bypasses RLS on the rights tables (no recursion).
CREATE OR REPLACE FUNCTION public.has_menu_right(_user_id uuid, _menu_key text, _action text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.access_profile_assignments apa
    JOIN public.access_profile_menu_rights apmr
      ON apmr.profile_id = apa.profile_id
    JOIN public.access_profiles ap
      ON ap.id = apa.profile_id
    WHERE apa.user_id = _user_id
      AND ap.is_active = true
      AND apmr.menu_key = _menu_key
      AND (
        (_action = 'view'   AND apmr.can_view   = true) OR
        (_action = 'add'    AND apmr.can_add    = true) OR
        (_action = 'update' AND apmr.can_update = true) OR
        (_action = 'delete' AND apmr.can_delete = true)
      )
  )
$$;

GRANT EXECUTE ON FUNCTION public.has_menu_right(uuid, text, text) TO authenticated, service_role;

-- Layer 1: profiles UPDATE delegated via admin-users / update
-- Additive to existing admin & self-update policies (permissive OR).
DROP POLICY IF EXISTS "Profile-granted users can update profiles" ON public.profiles;
CREATE POLICY "Profile-granted users can update profiles"
ON public.profiles
FOR UPDATE
TO authenticated
USING (public.has_menu_right(auth.uid(), 'admin-users', 'update'))
WITH CHECK (public.has_menu_right(auth.uid(), 'admin-users', 'update'));

-- Layer 1: access_profile_assignments delegated via admin-access-profiles
DROP POLICY IF EXISTS "Profile-granted users can insert assignments" ON public.access_profile_assignments;
CREATE POLICY "Profile-granted users can insert assignments"
ON public.access_profile_assignments
FOR INSERT
TO authenticated
WITH CHECK (public.has_menu_right(auth.uid(), 'admin-access-profiles', 'add'));

DROP POLICY IF EXISTS "Profile-granted users can delete assignments" ON public.access_profile_assignments;
CREATE POLICY "Profile-granted users can delete assignments"
ON public.access_profile_assignments
FOR DELETE
TO authenticated
USING (public.has_menu_right(auth.uid(), 'admin-access-profiles', 'delete'));

-- NOTE (per user decision):
-- * user_roles writes remain admin-only (no role-grant delegation).
-- * access_profile_menu_rights writes remain admin-only (menu-right editing
--   is itself a sensitive admin function).
