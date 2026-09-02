-- ADR-340 — Correct the live KPI range rename dry-run RPC.
-- ADR-338 replaced a similarly named, unused preview function. The UI calls
-- correct_kpis_range_dry_run, whose deployed body still compared review_status
-- to kpi_status literals ('locked', 'approved_by_manager').

CREATE OR REPLACE FUNCTION public.correct_kpis_range_dry_run(
  p_category_id uuid,
  p_old_kra text,
  p_old_kpi text,
  p_from_period text,
  p_from_year integer,
  p_to_period text,
  p_to_year integer
)
RETURNS TABLE (
  review_period text,
  review_year integer,
  kpi_rows integer,
  locked_rows integer,
  org_rows integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_from integer := p_from_year * 100 + public.kpi_period_month_num(p_from_period);
  v_to   integer := p_to_year   * 100 + public.kpi_period_month_num(p_to_period);
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin'::app_role)
          OR public.has_role(auth.uid(), 'hr_pms'::app_role)) THEN
    RAISE EXCEPTION 'Only admins or HR PMS can preview KPI name corrections';
  END IF;
  IF v_from < 202605 THEN
    RAISE EXCEPTION 'Cannot correct KPIs before May 2026. Past data is frozen.';
  END IF;
  IF v_to < v_from THEN
    RAISE EXCEPTION 'End month must not be before start month';
  END IF;

  RETURN QUERY
  WITH k AS (
    SELECT kp.review_period, kp.review_year,
           COUNT(*)::int AS n,
           COUNT(*) FILTER (
             WHERE rs.final_score IS NOT NULL OR kp.status::text <> 'kra_set'
           )::int AS locked_n
    FROM public.kpis kp
    LEFT JOIN public.review_submissions rs ON rs.kpi_id = kp.id
    WHERE kp.category_id = p_category_id
      AND LOWER(TRIM(kp.kra_name)) = LOWER(TRIM(p_old_kra))
      AND LOWER(TRIM(kp.kpi_name)) = LOWER(TRIM(p_old_kpi))
      AND (kp.review_year * 100 + public.kpi_period_month_num(kp.review_period)) BETWEEN v_from AND v_to
    GROUP BY kp.review_period, kp.review_year
  ), o AS (
    SELECT ov.review_period, ov.review_year, COUNT(*)::int AS n
    FROM public.org_kpi_values ov
    WHERE ov.category_id = p_category_id
      AND LOWER(TRIM(ov.kra_name)) = LOWER(TRIM(p_old_kra))
      AND LOWER(TRIM(ov.kpi_name)) = LOWER(TRIM(p_old_kpi))
      AND (ov.review_year * 100 + public.kpi_period_month_num(ov.review_period)) BETWEEN v_from AND v_to
    GROUP BY ov.review_period, ov.review_year
  )
  SELECT COALESCE(k.review_period, o.review_period)::text,
         COALESCE(k.review_year, o.review_year)::int,
         COALESCE(k.n, 0),
         COALESCE(k.locked_n, 0),
         COALESCE(o.n, 0)
  FROM k FULL OUTER JOIN o
    ON k.review_period = o.review_period AND k.review_year = o.review_year
  ORDER BY 2, public.kpi_period_month_num(COALESCE(k.review_period, o.review_period));
END;
$$;