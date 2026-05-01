
-- =============================================================
-- Scan for duplicate groups
-- =============================================================
CREATE OR REPLACE FUNCTION public.scan_kpi_duplicate_groups()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSONB;
BEGIN
  SELECT jsonb_agg(grp ORDER BY grp->>'row_count' DESC)
  INTO v_result
  FROM (
    SELECT jsonb_build_object(
      'normalized_kpi', norm_kpi,
      'category_id', cat_id,
      'category_name', cat_name,
      'variants', variants
    ) AS grp
    FROM (
      SELECT
        LOWER(TRIM(k.kpi_name)) AS norm_kpi,
        k.category_id AS cat_id,
        COALESCE(c.name, 'Unknown') AS cat_name,
        jsonb_agg(
          jsonb_build_object(
            'kra_name', k.kra_name,
            'kpi_name', k.kpi_name,
            'employee_count', sub.emp_count,
            'row_count', sub.row_count
          )
        ) AS variants
      FROM (
        SELECT
          category_id,
          kra_name,
          kpi_name,
          COUNT(DISTINCT employee_id) AS emp_count,
          COUNT(*) AS row_count
        FROM public.kpis
        GROUP BY category_id, kra_name, kpi_name
      ) sub
      JOIN public.kpis k ON k.category_id = sub.category_id AND k.kra_name = sub.kra_name AND k.kpi_name = sub.kpi_name
      LEFT JOIN public.kra_categories c ON c.id = k.category_id
      GROUP BY LOWER(TRIM(k.kpi_name)), k.category_id, c.name
      HAVING COUNT(DISTINCT k.kra_name) > 1
    ) grouped
  ) wrapped;

  RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;

-- =============================================================
-- Correct KPIs for a specific period (forward-only)
-- =============================================================
CREATE OR REPLACE FUNCTION public.correct_may_kpis(
  p_category_id UUID,
  p_old_kra TEXT,
  p_old_kpi TEXT,
  p_new_kra TEXT,
  p_new_kpi TEXT,
  p_definition_id UUID,
  p_review_period TEXT,
  p_review_year INTEGER
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER;
  v_month_num INTEGER;
BEGIN
  -- Map period name to month number for safety check
  v_month_num := CASE p_review_period
    WHEN 'January' THEN 1 WHEN 'February' THEN 2 WHEN 'March' THEN 3
    WHEN 'April' THEN 4 WHEN 'May' THEN 5 WHEN 'June' THEN 6
    WHEN 'July' THEN 7 WHEN 'August' THEN 8 WHEN 'September' THEN 9
    WHEN 'October' THEN 10 WHEN 'November' THEN 11 WHEN 'December' THEN 12
    ELSE 0
  END;

  -- Safety: only allow May 2026 onward
  IF p_review_year < 2026 OR (p_review_year = 2026 AND v_month_num < 5) THEN
    RAISE EXCEPTION 'Cannot correct KPIs before May 2026. Past data is frozen.';
  END IF;

  UPDATE public.kpis
  SET kra_name = p_new_kra,
      kpi_name = p_new_kpi,
      kpi_definition_id = p_definition_id,
      updated_at = now()
  WHERE category_id = p_category_id
    AND kra_name = p_old_kra
    AND kpi_name = p_old_kpi
    AND review_period = p_review_period
    AND review_year = p_review_year;

  GET DIAGNOSTICS v_count = ROW_COUNT;

  -- Also update org_kpi_values for the same period
  UPDATE public.org_kpi_values
  SET kra_name = p_new_kra,
      kpi_name = p_new_kpi,
      updated_at = now()
  WHERE category_id = p_category_id
    AND kra_name = p_old_kra
    AND kpi_name = p_old_kpi
    AND review_period = p_review_period
    AND review_year = p_review_year;

  RETURN v_count;
END;
$$;
