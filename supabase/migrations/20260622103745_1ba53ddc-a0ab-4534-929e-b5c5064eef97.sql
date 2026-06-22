
-- 1. email_logs: require authenticated admin (explicit anon block)
DROP POLICY IF EXISTS "Admins can view email logs" ON public.email_logs;
CREATE POLICY "Admins can view email logs"
ON public.email_logs FOR SELECT
TO authenticated
USING (auth.uid() IS NOT NULL AND has_role(auth.uid(), 'admin'::app_role));

-- 2. auth_lookup_attempts: explicit service_role write policy (table is fail-closed otherwise)
CREATE POLICY "Service role manages auth lookup attempts"
ON public.auth_lookup_attempts FOR ALL
TO service_role
USING (true) WITH CHECK (true);

CREATE POLICY "Admins can view auth lookup attempts"
ON public.auth_lookup_attempts FOR SELECT
TO authenticated
USING (auth.uid() IS NOT NULL AND has_role(auth.uid(), 'admin'::app_role));

-- 3. review-evidence storage: extend SELECT to skip-level managers and hr_pms
DROP POLICY IF EXISTS "Users can view authorized evidence" ON storage.objects;
CREATE POLICY "Users can view authorized evidence"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'review-evidence'
  AND (
    (auth.uid())::text = (storage.foldername(name))[1]
    OR has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'auditor'::app_role)
    OR has_role(auth.uid(), 'hr_pms'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE (p.id)::text = (storage.foldername(objects.name))[1]
        AND p.reporting_manager_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.profiles emp
      JOIN public.profiles mgr ON mgr.id = emp.reporting_manager_id
      WHERE (emp.id)::text = (storage.foldername(objects.name))[1]
        AND mgr.reporting_manager_id = auth.uid()
    )
  )
);
