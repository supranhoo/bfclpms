
-- Step A — Performance hotspot indexes (additive, rollback = DROP INDEX IF EXISTS)
-- Drives down the top-5 query patterns from pg_stat_statements that account for
-- ~107,500 seconds of cumulative DB time across the last boot window.

-- #1, #3, #7: kpis full/period scans sorted by created_at DESC
CREATE INDEX IF NOT EXISTS idx_kpis_period_year_created
  ON public.kpis (review_period, review_year, created_at DESC);

-- Helps the bare "ORDER BY created_at DESC" paginator too.
CREATE INDEX IF NOT EXISTS idx_kpis_created_at_desc
  ON public.kpis (created_at DESC);

-- #2: org-KPI duplicate-check on save
CREATE INDEX IF NOT EXISTS idx_kpis_dup_check
  ON public.kpis (category_id, kra_name, kpi_name, review_period, review_year, is_org_level);

-- #5: sub-period history fetch for org-KPI cells
CREATE INDEX IF NOT EXISTS idx_org_kpi_logs_lookup
  ON public.org_kpi_data_entry_logs
    (category_id, kra_name, kpi_name, review_period, review_year, created_at DESC);

-- #6 / #4: profile picker + distinct-designation scans (partial index keeps it small)
CREATE INDEX IF NOT EXISTS idx_profiles_active_fullname
  ON public.profiles (full_name)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_profiles_active_designation
  ON public.profiles (designation)
  WHERE is_active = true AND designation IS NOT NULL;

-- #6-#8 cluster: review_submissions.kpi_id = ANY(...). Create only if missing.
CREATE INDEX IF NOT EXISTS idx_review_submissions_kpi_id
  ON public.review_submissions (kpi_id);

-- #8: kpi_observations.kpi_id = ANY(...) ORDER BY created_at DESC
CREATE INDEX IF NOT EXISTS idx_kpi_observations_kpi_created
  ON public.kpi_observations (kpi_id, created_at DESC);
