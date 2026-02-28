
CREATE OR REPLACE FUNCTION public.get_kpi_accessible_user_ids(p_kpi_id uuid)
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  -- 1. The KPI employee
  SELECT k.employee_id FROM kpis k WHERE k.id = p_kpi_id

  UNION

  -- 2. The employee's reporting manager
  SELECT p.reporting_manager_id FROM kpis k
    JOIN profiles p ON p.id = k.employee_id
  WHERE k.id = p_kpi_id AND p.reporting_manager_id IS NOT NULL

  UNION

  -- 3. Skip-level manager
  SELECT get_skip_level_manager(k.employee_id) FROM kpis k
  WHERE k.id = p_kpi_id AND get_skip_level_manager(k.employee_id) IS NOT NULL

  UNION

  -- 4. Admins, Auditors, HR PMS, Management
  SELECT ur.user_id FROM user_roles ur
  WHERE ur.role IN ('admin', 'auditor', 'hr_pms', 'management')

  UNION

  -- 5. Data owners (for org-level KPIs)
  SELECT o.owner_id FROM org_kpi_data_owners o
    JOIN kpis k ON k.category_id = o.category_id
      AND k.kra_name = o.kra_name
      AND k.kpi_name = o.kpi_name
  WHERE k.id = p_kpi_id AND k.is_org_level = true

  UNION

  -- 6. Users with existing mention access
  SELECT m.user_id FROM kpi_mention_access m
  WHERE m.kpi_id = p_kpi_id;
$$;
