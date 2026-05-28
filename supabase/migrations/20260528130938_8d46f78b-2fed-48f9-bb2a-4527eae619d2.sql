-- Allow profile-menu-access readers to see inactive employees within their org scope
-- so User Management stats (Total/Active/Inactive) are accurate.
DROP POLICY IF EXISTS "Profile-granted users can view scoped active profiles" ON public.profiles;

CREATE POLICY "Profile-granted users can view scoped profiles"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  public.has_profile_menu_access(auth.uid(), 'admin-users', 'view')
  AND public.user_can_see_employee(auth.uid(), id)
);