
-- v1.45.24: Fix HR PMS profile visibility & org_kpi_values role mismatch

-- Issue 1 Fix: Add missing SELECT policy for hr_pms on profiles table
-- Without this, Vivek can only see ~26 profiles (his own + data owner managed employees)
-- instead of all 426 employees with hr_pms_review in their workflow
CREATE POLICY "HR PMS can view all profiles"
ON public.profiles
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'hr_pms'::app_role));

-- Bonus Fix: org_kpi_values policies were on {public} role (same systemic bug as kpis/review_submissions)
-- {public} only applies to anonymous requests, not authenticated users — fix to {authenticated}
ALTER POLICY "Admins can manage org_kpi_values" ON public.org_kpi_values TO authenticated;
ALTER POLICY "Authenticated users can view org_kpi_values" ON public.org_kpi_values TO authenticated;
