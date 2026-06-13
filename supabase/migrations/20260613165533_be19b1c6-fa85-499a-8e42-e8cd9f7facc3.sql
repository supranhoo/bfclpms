-- v2.66.13 — Perf indexes for top slow queries (pg_stat_statements)
-- Covers the KPI dedupe lookup that fires on every data-import/uniqueness check
-- (~58k calls/day, 177ms mean). Existing partial index `idx_kpis_org_period_sort`
-- only covers is_org_level=true; this composite covers both branches.
CREATE INDEX IF NOT EXISTS idx_kpis_dedupe_lookup
  ON public.kpis (category_id, kra_name, kpi_name, review_period, review_year, is_org_level);

-- Drop redundant non-unique kpi_id index on review_submissions — the table
-- already has `review_submissions_kpi_id_unique` (UNIQUE btree on kpi_id),
-- which Postgres uses for the same queries. The duplicate doubles write cost
-- on every submission upsert with zero read benefit.
DROP INDEX IF EXISTS public.idx_review_submissions_kpi_id;