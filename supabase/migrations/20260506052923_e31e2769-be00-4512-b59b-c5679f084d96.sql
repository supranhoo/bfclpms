
CREATE OR REPLACE FUNCTION public.rpc_org_kpi_filled_keys(
  p_period text,
  p_year int
)
RETURNS TABLE(category_id uuid, kra_name text, kpi_name text, employee_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT v.category_id, v.kra_name, v.kpi_name, v.employee_id
  FROM public.org_kpi_values v
  WHERE v.employee_id IS NOT NULL
    AND (p_period IS NULL OR v.review_period = p_period)
    AND (p_year IS NULL OR v.review_year = p_year)
    AND (v.achieved_value IS NOT NULL OR v.is_na = true)
    AND public.has_role(auth.uid(), 'admin'::public.app_role);
$$;

GRANT EXECUTE ON FUNCTION public.rpc_org_kpi_filled_keys(text, int) TO authenticated;
