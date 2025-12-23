
-- Allow users to update their own KPIs (for self-review status updates)
CREATE POLICY "Users can update their own KPIs"
ON public.kpis
FOR UPDATE
USING (employee_id = auth.uid());
