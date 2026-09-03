DROP FUNCTION IF EXISTS public.rpc_kpi_employee_matrix_rows(text, integer, uuid[], uuid);

CREATE FUNCTION public.rpc_kpi_employee_matrix_rows(p_period text, p_year integer, p_employee_ids uuid[], p_category_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(kpi_id uuid, employee_id uuid, kra_name text, kpi_name text, description text, weightage numeric, category_id uuid, category_name text, kpi_title text, kpi_description text, kpi_formula text, kpi_scoring_logic text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT k.id, k.employee_id, k.kra_name, k.kpi_name, k.criteria, k.weightage,
         k.category_id, c.name,
         k.kpi_title, k.kpi_description, k.kpi_formula, k.kpi_scoring_logic
  FROM public.kpis k
  LEFT JOIN public.kra_categories c ON c.id = k.category_id
  WHERE k.review_period = p_period
    AND k.review_year = p_year
    AND k.employee_id = ANY(p_employee_ids)
    AND (p_category_id IS NULL OR k.category_id = p_category_id);
$function$;

GRANT EXECUTE ON FUNCTION public.rpc_kpi_employee_matrix_rows(text, integer, uuid[], uuid) TO authenticated, service_role;