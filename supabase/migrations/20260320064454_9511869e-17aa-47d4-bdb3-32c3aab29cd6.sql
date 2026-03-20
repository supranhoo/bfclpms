-- Fix 1: Allow query raiser to update their own queries (needed for Accept Response)
CREATE POLICY "Users can update queries they raised"
ON public.kpi_queries
FOR UPDATE
TO authenticated
USING (raised_by = auth.uid());