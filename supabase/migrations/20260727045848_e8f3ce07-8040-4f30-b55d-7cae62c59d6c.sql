-- Prevent privilege escalation via delegated access-profile assignment.
CREATE OR REPLACE FUNCTION public.can_grant_access_profile(_uid uuid, _profile_id uuid, _target_user uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF _uid IS NULL THEN
    RETURN false;
  END IF;
  -- Full admins retain unrestricted control.
  IF public.has_role(_uid, 'admin') THEN
    RETURN true;
  END IF;
  -- Delegated grantors must hold the menu right...
  IF NOT public.has_menu_right(_uid, 'admin-access-profiles', 'add') THEN
    RETURN false;
  END IF;
  -- ...must not grant to themselves...
  IF _target_user = _uid THEN
    RETURN false;
  END IF;
  -- ...and may only grant profiles whose rights they already hold.
  RETURN NOT EXISTS (
    SELECT 1
    FROM public.access_profile_menu_rights r
    WHERE r.profile_id = _profile_id
      AND (
        (COALESCE(r.can_view, false)   AND NOT public.has_menu_right(_uid, r.menu_key, 'view'))
        OR (COALESCE(r.can_add, false)    AND NOT public.has_menu_right(_uid, r.menu_key, 'add'))
        OR (COALESCE(r.can_edit, false)   AND NOT public.has_menu_right(_uid, r.menu_key, 'edit'))
        OR (COALESCE(r.can_delete, false) AND NOT public.has_menu_right(_uid, r.menu_key, 'delete'))
      )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.can_grant_access_profile(uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_grant_access_profile(uuid, uuid, uuid) TO authenticated;

DROP POLICY IF EXISTS "Profile-granted users can insert assignments" ON public.access_profile_assignments;
CREATE POLICY "Profile-granted users can insert assignments"
  ON public.access_profile_assignments FOR INSERT TO authenticated
  WITH CHECK (public.can_grant_access_profile(auth.uid(), profile_id, user_id));

DROP POLICY IF EXISTS "Profile-granted users can delete assignments" ON public.access_profile_assignments;
CREATE POLICY "Profile-granted users can delete assignments"
  ON public.access_profile_assignments FOR DELETE TO authenticated
  USING (
    public.has_menu_right(auth.uid(), 'admin-access-profiles', 'delete')
    AND public.can_grant_access_profile(auth.uid(), profile_id, user_id)
  );