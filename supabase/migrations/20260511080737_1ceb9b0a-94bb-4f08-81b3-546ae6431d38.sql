-- Active profiles sorted by full_name (matches useProfiles / useProfilesByWorkflowStage)
CREATE INDEX IF NOT EXISTS idx_profiles_active_name
  ON public.profiles (full_name)
  WHERE is_active = true;

-- KPI period queries ordered by created_at (matches useKpisByPeriod*)
CREATE INDEX IF NOT EXISTS idx_kpis_period_year_created
  ON public.kpis (review_year, review_period, created_at DESC, id);

-- KPI status by period (Pending Self/Manager/Skip dashboards seed query)
CREATE INDEX IF NOT EXISTS idx_kpis_status_period_year
  ON public.kpis (status, review_period, review_year);

-- Help RLS subquery: profiles by reporting_manager_id filtered to active
CREATE INDEX IF NOT EXISTS idx_profiles_active_manager
  ON public.profiles (reporting_manager_id)
  WHERE is_active = true;