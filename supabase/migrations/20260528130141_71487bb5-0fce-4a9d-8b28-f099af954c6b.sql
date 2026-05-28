-- Bridge: let users with profile-granted "admin-users" menu rights READ profiles
-- inside their Org-Level Scope. Writes still require admin role.

CREATE OR REPLACE FUNCTION public.has_profile_menu_access(
  _user_id uuid,
  _menu_key text,
  _action  text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.access_profile_assignments apa
    JOIN public.access_profiles ap
      ON ap.id = apa.profile_id AND ap.is_active = true
    JOIN public.access_profile_menu_rights mr
      ON mr.profile_id = ap.id AND mr.menu_key = _menu_key
    WHERE apa.user_id = _user_id
      AND (
        (_action = 'view'   AND mr.can_view   = true) OR
        (_action = 'add'    AND mr.can_add    = true) OR
        (_action = 'update' AND mr.can_update = true) OR
        (_action = 'delete' AND mr.can_delete = true)
      )
  );
$$;

GRANT EXECUTE ON FUNCTION public.has_profile_menu_access(uuid, text, text) TO authenticated;

-- Permissive SELECT policy: combines with existing policies via OR semantics.
DROP POLICY IF EXISTS "Profile-granted users can view scoped active profiles" ON public.profiles;
CREATE POLICY "Profile-granted users can view scoped active profiles"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  is_active = true
  AND public.has_profile_menu_access(auth.uid(), 'admin-users', 'view')
  AND public.user_can_see_employee(auth.uid(), id)
);