-- Allow users with 'reports-incentive' menu access to view active profiles.
-- Without this, the Incentive Report preview dialog shows truncated UUIDs
-- instead of employee names, because the profile lookup is RLS-filtered.
CREATE POLICY "Incentive report users can view active profiles"
ON public.profiles FOR SELECT TO authenticated
USING (is_active = true AND has_menu_access_override(auth.uid(), 'reports-incentive'));
