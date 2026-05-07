-- Performance index for Org KPI Data Entry lookup.
-- The page filters kpis by (is_org_level, review_period, review_year) and
-- orders by (category_id, kra_name, kpi_name). The existing
-- idx_kpis_org_norm_triple is partial on is_org_level but does not include
-- the period columns; idx_kpis_review_year_period covers period but not the
-- org-level filter. Under the table's RLS evaluation, the BitmapAnd combo
-- can exceed statement_timeout when 800+ rows match — surfacing as 57014
-- and a false "No org-level KPIs exist" empty state.
--
-- This composite partial index covers the exact predicate + sort key in one
-- index-only walk, eliminating the timeout for the Org KPI Data Entry page.
CREATE INDEX IF NOT EXISTS idx_kpis_org_period_sort
  ON public.kpis (review_year, review_period, category_id, kra_name, kpi_name)
  WHERE is_org_level = true;
