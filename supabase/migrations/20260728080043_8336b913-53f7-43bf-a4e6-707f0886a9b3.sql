CREATE OR REPLACE FUNCTION public.get_annual_review_monthly_kra_matrix(
  p_employee_ids uuid[],
  p_fy_start integer,
  p_exclude_na boolean DEFAULT true
)
RETURNS TABLE(
  employee_id uuid,
  review_period text,
  review_year integer,
  avg_rating numeric,
  achieved numeric,
  out_of numeric,
  pct numeric,
  kpi_count integer
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  KPI_SCALE_MAX CONSTANT numeric := 5;
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL
     OR NOT (public.has_role(v_uid, 'admin')
             OR public.has_role(v_uid, 'hr_pms')
             OR public.has_role(v_uid, 'management')) THEN
    RAISE EXCEPTION 'permission denied' USING ERRCODE = '42501';
  END IF;

  IF p_employee_ids IS NULL OR array_length(p_employee_ids, 1) IS NULL OR p_fy_start IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH months AS (
    SELECT * FROM (VALUES
      ('July',1),('August',2),('September',3),('October',4),('November',5),('December',6),
      ('January',7),('February',8),('March',9),('April',10),('May',11),('June',12)
    ) AS m(month_name, ord)
  ),
  scored AS (
    SELECT
      k.employee_id            AS emp_id,
      k.review_period          AS period,
      k.review_year            AS ryear,
      COALESCE(k.weightage, 1) AS wt,
      s.score                  AS score
    FROM public.kpis k
    JOIN months m
      ON m.month_name = k.review_period
     AND k.review_year = CASE WHEN m.ord <= 6 THEN p_fy_start ELSE p_fy_start + 1 END
    LEFT JOIN LATERAL (
      SELECT rs.is_na,
             COALESCE(rs.final_score, rs.auditor_score, rs.manager_score, rs.self_score) AS score
        FROM public.review_submissions rs
       WHERE rs.kpi_id = k.id
       LIMIT 1
    ) s ON true
    WHERE k.employee_id = ANY(p_employee_ids)
      AND s.score IS NOT NULL
      AND (NOT p_exclude_na OR COALESCE(s.is_na, false) = false)
  )
  SELECT
    sc.emp_id,
    sc.period,
    sc.ryear,
    ROUND(SUM(sc.score * sc.wt) / NULLIF(SUM(sc.wt), 0), 2)                             AS avg_rating,
    ROUND(SUM(sc.score * sc.wt), 2)                                                      AS achieved,
    ROUND(SUM(sc.wt) * KPI_SCALE_MAX, 2)                                                 AS out_of,
    ROUND((SUM(sc.score * sc.wt) / NULLIF(SUM(sc.wt) * KPI_SCALE_MAX, 0)) * 100, 2)      AS pct,
    COUNT(*)::int                                                                        AS kpi_count
  FROM scored sc
  GROUP BY sc.emp_id, sc.period, sc.ryear;
END
$function$;

GRANT EXECUTE ON FUNCTION public.get_annual_review_monthly_kra_matrix(uuid[], integer, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_annual_review_monthly_kra_matrix(uuid[], integer, boolean) TO service_role;