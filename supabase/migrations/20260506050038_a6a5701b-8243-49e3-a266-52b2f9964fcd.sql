
CREATE OR REPLACE FUNCTION public.rpc_weightage_eligible_employees(
  p_fiscal_start_year integer,
  p_category_id uuid DEFAULT NULL
)
RETURNS TABLE(employee_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT k.employee_id
  FROM public.kpis k
  WHERE k.review_year IN (p_fiscal_start_year, p_fiscal_start_year + 1)
    AND k.employee_id IS NOT NULL
    AND (p_category_id IS NULL OR k.category_id = p_category_id)
    AND public.has_role(auth.uid(), 'admin');
$$;

CREATE OR REPLACE FUNCTION public.rpc_weightage_variance_summary(
  p_fiscal_start_year integer,
  p_employee_ids uuid[],
  p_category_id uuid DEFAULT NULL
)
RETURNS TABLE(variance_count integer, acknowledged_count integer)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_month_order text[] := ARRAY['July','August','September','October','November','December','January','February','March','April','May','June'];
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  RETURN QUERY
  WITH raw AS (
    SELECT
      k.employee_id,
      k.kra_name,
      k.kpi_name,
      k.review_period,
      k.weightage,
      COALESCE(k.weightage_variance_acknowledged, false) AS ack,
      COALESCE(array_position(v_month_order, k.review_period), 99) AS month_idx
    FROM public.kpis k
    WHERE k.review_year IN (p_fiscal_start_year, p_fiscal_start_year + 1)
      AND k.employee_id = ANY(p_employee_ids)
      AND (p_category_id IS NULL OR k.category_id = p_category_id)
  ),
  grouped AS (
    SELECT
      employee_id, kra_name, kpi_name,
      COUNT(*) AS total_count,
      COUNT(*) FILTER (WHERE ack) AS ack_count,
      (SELECT r2.weightage FROM raw r2
        WHERE r2.employee_id = r.employee_id AND r2.kra_name = r.kra_name AND r2.kpi_name = r.kpi_name
          AND r2.weightage IS NOT NULL
        ORDER BY r2.month_idx ASC LIMIT 1) AS baseline,
      bool_or(weightage IS NOT NULL) AS any_weight,
      array_agg(weightage) AS weights
    FROM raw r
    GROUP BY employee_id, kra_name, kpi_name
  ),
  flagged AS (
    SELECT
      g.*,
      EXISTS (
        SELECT 1 FROM unnest(g.weights) w
        WHERE w IS NOT NULL AND g.baseline IS NOT NULL AND w <> g.baseline
      ) AS has_mismatch
    FROM grouped g
  )
  SELECT
    COALESCE(SUM(CASE WHEN has_mismatch AND NOT (total_count > 0 AND ack_count = total_count) THEN 1 ELSE 0 END), 0)::int AS variance_count,
    COALESCE(SUM(CASE WHEN has_mismatch AND total_count > 0 AND ack_count = total_count THEN 1 ELSE 0 END), 0)::int AS acknowledged_count
  FROM flagged
  WHERE baseline IS NOT NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_weightage_eligible_employees(integer, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_weightage_variance_summary(integer, uuid[], uuid) TO authenticated;
