
-- R2: Compound indexes targeting the top 11 slowest query shapes from pg_stat_statements.
-- All additive; safe to roll back with DROP INDEX.

-- Query #1 & #8: kpis paged by created_at, often filtered by period+year.
CREATE INDEX IF NOT EXISTS idx_kpis_period_year_created
  ON public.kpis (review_period, review_year, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_kpis_created_at_desc
  ON public.kpis (created_at DESC);

-- Query #2: duplicate-KPI existence check (called 71k+ times).
CREATE INDEX IF NOT EXISTS idx_kpis_dup_check
  ON public.kpis (category_id, kra_name, kpi_name, review_period, review_year, is_org_level);

-- Query #11: org-level KPIs joined with profiles by period+year.
CREATE INDEX IF NOT EXISTS idx_kpis_orglevel_period
  ON public.kpis (review_period, review_year, is_org_level)
  WHERE employee_id IS NOT NULL;

-- Query #7 helper: kpis lookup by employee + period.
CREATE INDEX IF NOT EXISTS idx_kpis_employee_period
  ON public.kpis (employee_id, review_period, review_year);

-- Query #4: org_kpi_data_entry_logs latest-entry lookup (137k+ calls).
CREATE INDEX IF NOT EXISTS idx_org_kpi_entry_logs_key_created
  ON public.org_kpi_data_entry_logs (category_id, kra_name, kpi_name, review_period, review_year, created_at DESC);

-- Queries #3, #5, #10: profiles filtered by is_active, ordered by full_name.
CREATE INDEX IF NOT EXISTS idx_profiles_active_fullname
  ON public.profiles (is_active, full_name)
  WHERE is_active = true;

-- Query #3 specifically: designation distinct lookup.
CREATE INDEX IF NOT EXISTS idx_profiles_active_designation
  ON public.profiles (is_active, designation)
  WHERE is_active = true AND designation IS NOT NULL;

-- Queries #6, #9, #12: review_submissions WHERE kpi_id = ANY(...).
-- Ensure FK lookup index exists (no-op if already present).
CREATE INDEX IF NOT EXISTS idx_review_submissions_kpi_id
  ON public.review_submissions (kpi_id);
