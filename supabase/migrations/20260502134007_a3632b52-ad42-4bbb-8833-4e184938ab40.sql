-- Step 1: Flag April 2026 KPIs as org-level for every March 2026 org-level definition
WITH march_org AS (
  SELECT DISTINCT employee_id, category_id, kra_name, kpi_name, org_level_scope
  FROM kpis
  WHERE review_period = 'March'
    AND review_year = 2026
    AND is_org_level = true
)
UPDATE kpis a
SET is_org_level = true,
    org_level_scope = COALESCE(m.org_level_scope, 'employee'),
    updated_at = now()
FROM march_org m
WHERE a.review_period = 'April'
  AND a.review_year = 2026
  AND a.employee_id = m.employee_id
  AND a.category_id = m.category_id
  AND a.kra_name = m.kra_name
  AND a.kpi_name = m.kpi_name
  AND (a.is_org_level IS DISTINCT FROM true
       OR a.org_level_scope IS DISTINCT FROM COALESCE(m.org_level_scope, 'employee'));

-- Step 2: Ensure data-owner assignments exist for every March org KPI definition (idempotent)
INSERT INTO org_kpi_data_owners (category_id, kra_name, kpi_name, owner_id, assigned_by)
SELECT DISTINCT m.category_id, m.kra_name, m.kpi_name, m.owner_id, m.assigned_by
FROM org_kpi_data_owners m
WHERE EXISTS (
  SELECT 1 FROM kpis k
  WHERE k.review_period = 'March' AND k.review_year = 2026 AND k.is_org_level = true
    AND k.category_id = m.category_id AND k.kra_name = m.kra_name AND k.kpi_name = m.kpi_name
)
ON CONFLICT DO NOTHING;