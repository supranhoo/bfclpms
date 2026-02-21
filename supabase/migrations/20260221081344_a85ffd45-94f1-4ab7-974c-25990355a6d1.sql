-- Drop the existing restrictive policy
DROP POLICY IF EXISTS "Management can update KPI status during review" ON public.kpis;

-- Re-create with explicit WITH CHECK allowing status transitions
CREATE POLICY "Management can update KPI status during review"
  ON public.kpis
  FOR UPDATE
  TO authenticated
  USING (
    has_role(auth.uid(), 'management'::app_role)
    AND status = 'management_review'::review_status
  )
  WITH CHECK (
    has_role(auth.uid(), 'management'::app_role)
  );