DROP FUNCTION IF EXISTS public.scan_kpi_duplicate_groups();
DROP FUNCTION IF EXISTS public.scan_kpi_duplicate_groups(boolean);

CREATE OR REPLACE FUNCTION public.scan_kpi_duplicate_groups(p_include_skipped boolean DEFAULT false)
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
      k.category_id              AS cat_id,
      k.kra_name,
      k.kpi_name,
      LOWER(TRIM(k.kpi_name))    AS norm_kpi,
      COUNT(DISTINCT k.employee_id) AS emp_count,
      COUNT(*)                   AS row_count
    FROM public.kpis k
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.kpi_name_aliases a
      WHERE a.category_id = k.category_id
        AND LOWER(TRIM(a.variant_kra_name)) = LOWER(TRIM(k.kra_name))
        AND LOWER(TRIM(a.variant_kpi_name)) = LOWER(TRIM(k.kpi_name))
    )
    GROUP BY k.category_id, k.kra_name, k.kpi_name
  ),
  grouped AS (
    SELECT
      s.norm_kpi,
      s.cat_id,
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
      SUM(s.row_count) AS total_rows,
      EXISTS (
        SELECT 1 FROM public.kpi_scanner_skips sk
        WHERE sk.category_id = s.cat_id
          AND sk.normalized_kpi = s.norm_kpi
      ) AS is_skipped
    FROM sub s
    LEFT JOIN public.kra_categories c ON c.id = s.cat_id
    GROUP BY s.norm_kpi, s.cat_id, c.name
    HAVING COUNT(DISTINCT s.kra_name) > 1
  )
  SELECT jsonb_agg(
    jsonb_build_object(
      'normalized_kpi', norm_kpi,
      'category_id',    cat_id,
      'category_name',  cat_name,
      'variants',       variants,
      'is_skipped',     is_skipped
    )
    ORDER BY total_rows DESC
  )
  INTO v_result
  FROM grouped
  WHERE (p_include_skipped OR NOT is_skipped);

  RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;

COMMENT ON FUNCTION public.scan_kpi_duplicate_groups(boolean) IS
  'Returns duplicate KPI groups for admin review. Inner CTE precomputes norm_kpi so all correlated subqueries reference grouped columns. Excludes variants already linked via kpi_name_aliases. Excludes groups in kpi_scanner_skips unless p_include_skipped = true.';