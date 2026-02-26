CREATE POLICY "Auditors can view auditor roles"
ON public.user_roles
FOR SELECT
TO authenticated
USING (
  role = 'auditor'
  AND has_role(auth.uid(), 'auditor'::app_role)
);