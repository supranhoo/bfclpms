CREATE POLICY "Admins can update menu user overrides"
ON public.menu_access_user_overrides
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));