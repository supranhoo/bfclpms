
-- Server-side scoping for KPI-Employee Matrix (fixes statement timeout)
CREATE OR REPLACE FUNCTION public.rpc_kpi_employee_matrix_scope(
  p_period text,
  p_year int,
  p_division_id uuid DEFAULT NULL,
  p_bu_id uuid DEFAULT NULL,
  p_dept_id uuid DEFAULT NULL,
  p_category_id uuid DEFAULT NULL,
  p_search text DEFAULT NULL
)
RETURNS TABLE(employee_id uuid, kpi_count bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT k.employee_id, COUNT(*)::bigint AS kpi_count
  FROM public.kpis k
  JOIN public.profiles p ON p.id = k.employee_id
  LEFT JOIN public.departments d ON d.id = p.department_id
  LEFT JOIN public.business_units bu ON bu.id = d.business_unit_id
  WHERE k.review_period = p_period
    AND k.review_year = p_year
    AND (p_category_id IS NULL OR k.category_id = p_category_id)
    AND (p_dept_id IS NULL OR p.department_id = p_dept_id)
    AND (
      p_division_id IS NOT NULL AND bu.division_id = p_division_id
      OR p_division_id IS NULL AND (p_bu_id IS NULL OR d.business_unit_id = p_bu_id)
    )
    AND (
      p_search IS NULL OR p_search = '' OR
      p.full_name ILIKE '%' || p_search || '%' OR
      p.employee_code ILIKE '%' || p_search || '%' OR
      k.kra_name ILIKE '%' || p_search || '%' OR
      k.kpi_name ILIKE '%' || p_search || '%'
    )
  GROUP BY k.employee_id;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_kpi_employee_matrix_scope(text,int,uuid,uuid,uuid,uuid,text) TO authenticated;

-- KPI rows for a given employee batch (no nested profiles/departments join)
CREATE OR REPLACE FUNCTION public.rpc_kpi_employee_matrix_rows(
  p_period text,
  p_year int,
  p_employee_ids uuid[],
  p_category_id uuid DEFAULT NULL
)
RETURNS TABLE(
  kpi_id uuid,
  employee_id uuid,
  kra_name text,
  kpi_name text,
  weightage numeric,
  category_id uuid,
  category_name text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT k.id, k.employee_id, k.kra_name, k.kpi_name, k.weightage,
         k.category_id, c.name
  FROM public.kpis k
  LEFT JOIN public.kra_categories c ON c.id = k.category_id
  WHERE k.review_period = p_period
    AND k.review_year = p_year
    AND k.employee_id = ANY(p_employee_ids)
    AND (p_category_id IS NULL OR k.category_id = p_category_id);
$$;

GRANT EXECUTE ON FUNCTION public.rpc_kpi_employee_matrix_rows(text,int,uuid[],uuid) TO authenticated;
