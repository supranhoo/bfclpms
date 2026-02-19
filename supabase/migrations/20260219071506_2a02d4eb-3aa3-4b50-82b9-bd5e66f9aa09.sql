
-- Fix systemic RLS role mismatch: policies for hr_pms, management, and skip_level
-- were created with roles: {public} instead of roles: {authenticated}.
-- Authenticated users (logged-in) are NOT covered by {public} policies,
-- so these roles effectively had no data visibility. This fix corrects all affected
-- policies on the kpis and review_submissions tables.

-- ============================================================
-- kpis table: fix 7 policies
-- ============================================================
ALTER POLICY "HR PMS can view all KPIs" ON public.kpis TO authenticated;
ALTER POLICY "HR PMS can update KPI status during review" ON public.kpis TO authenticated;
ALTER POLICY "Management can view all KPIs" ON public.kpis TO authenticated;
ALTER POLICY "Management can update KPI status during review" ON public.kpis TO authenticated;
ALTER POLICY "Skip-level managers can view reports KPIs" ON public.kpis TO authenticated;
ALTER POLICY "Skip-level managers can update reports KPI status" ON public.kpis TO authenticated;
ALTER POLICY "Users can update their own KPIs" ON public.kpis TO authenticated;

-- ============================================================
-- review_submissions table: fix 6 policies
-- ============================================================
ALTER POLICY "HR PMS can view all submissions" ON public.review_submissions TO authenticated;
ALTER POLICY "HR PMS can update submissions during review" ON public.review_submissions TO authenticated;
ALTER POLICY "Management can view all submissions" ON public.review_submissions TO authenticated;
ALTER POLICY "Management can update submissions during review" ON public.review_submissions TO authenticated;
ALTER POLICY "Skip-level managers can view reports submissions" ON public.review_submissions TO authenticated;
ALTER POLICY "Skip-level managers can update reports submissions" ON public.review_submissions TO authenticated;
