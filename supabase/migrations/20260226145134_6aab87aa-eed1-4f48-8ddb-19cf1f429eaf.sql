
CREATE INDEX IF NOT EXISTS idx_kpis_review_year_period ON public.kpis(review_year, review_period);
CREATE INDEX IF NOT EXISTS idx_kpis_employee_id ON public.kpis(employee_id);
CREATE INDEX IF NOT EXISTS idx_review_submissions_kpi_id ON public.review_submissions(kpi_id);
CREATE INDEX IF NOT EXISTS idx_profiles_reporting_manager_id ON public.profiles(reporting_manager_id);
