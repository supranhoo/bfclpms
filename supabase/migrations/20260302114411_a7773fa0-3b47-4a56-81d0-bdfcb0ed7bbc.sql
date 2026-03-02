
-- Prevent future exact-duplicate KPIs (same employee + period + year + KRA + KPI name)
CREATE UNIQUE INDEX IF NOT EXISTS idx_kpis_no_duplicates 
ON kpis (employee_id, COALESCE(review_period, ''), COALESCE(review_year, 0), kra_name, kpi_name);
