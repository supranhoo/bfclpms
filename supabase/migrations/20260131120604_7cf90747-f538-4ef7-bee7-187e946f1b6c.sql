-- Allow auditors to view all profiles for audit purposes
CREATE POLICY "Auditors can view all profiles"
ON public.profiles
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'auditor'::app_role));