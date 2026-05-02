CREATE OR REPLACE FUNCTION public.scan_kpi_duplicate_groups()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSONB;
BEGIN
  WITH sub AS (
    SELECT
      category_id,
      kra_name,
      kpi_name,
      COUNT(DISTINCT employee_id) AS emp_count,
      COUNT(*) AS row_count
    FROM public.kpis
    GROUP BY category_id, kra_name, kpi_name
  ),
  grouped AS (
    SELECT
      LOWER(TRIM(s.kpi_name)) AS norm_kpi,
      s.category_id           AS cat_id,
      COALESCE(c.name, 'Unknown') AS cat_name,
      jsonb_agg(
        jsonb_build_object(
          'kra_name',       s.kra_name,
          'kpi_name',       s.kpi_name,
          'employee_count', s.emp_count,
          'row_count',      s.row_count
        )
        ORDER BY s.kra_name, s.kpi_name
      ) AS variants,
      SUM(s.row_count) AS total_rows
    FROM sub s
    LEFT JOIN public.kra_categories c ON c.id = s.category_id
    GROUP BY LOWER(TRIM(s.kpi_name)), s.category_id, c.name
    HAVING COUNT(DISTINCT s.kra_name) > 1
  )
  SELECT jsonb_agg(
    jsonb_build_object(
      'normalized_kpi', norm_kpi,
      'category_id',    cat_id,
      'category_name',  cat_name,
      'variants',       variants
    )
    ORDER BY total_rows DESC
  )
  INTO v_result
  FROM grouped;

  RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;