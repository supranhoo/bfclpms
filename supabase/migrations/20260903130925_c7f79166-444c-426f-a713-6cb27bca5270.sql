CREATE OR REPLACE FUNCTION public.list_split_kpi_name_variants()
RETURNS TABLE (
  category_id uuid,
  category_name text,
  kra_name text,
  kpi_title text,
  variant_count integer,
  open_rows integer,
  total_rows integer,
  canonical_kpi_name text,
  variants jsonb
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH scoped AS (
    SELECT k.category_id, k.kra_name, k.kpi_title, k.kpi_name, k.id,
           (k.status::text = 'kra_set') AS is_open
    FROM public.kpis k
    WHERE COALESCE(k.kpi_title, '') <> ''
      AND (k.review_year * 100 + public.kpi_period_month_num(k.review_period)) >= 202605
      AND (
        public.has_role(auth.uid(), 'admin'::app_role)
        OR public.has_role(auth.uid(), 'auditor'::app_role)
        OR public.has_role(auth.uid(), 'management'::app_role)
        OR public.has_role(auth.uid(), 'hr_pms'::app_role)
      )
  ), per_variant AS (
    SELECT category_id, kra_name, kpi_title, kpi_name,
           COUNT(*)::int AS rows_cnt,
           COUNT(*) FILTER (WHERE is_open)::int AS open_cnt,
           MIN(LENGTH(kpi_name))::int AS name_len
    FROM scoped
    GROUP BY 1,2,3,4
  )
  SELECT v.category_id,
         c.name AS category_name,
         v.kra_name,
         v.kpi_title,
         COUNT(*)::int AS variant_count,
         SUM(v.open_cnt)::int AS open_rows,
         SUM(v.rows_cnt)::int AS total_rows,
         (ARRAY_AGG(v.kpi_name ORDER BY v.name_len ASC, v.kpi_name ASC))[1] AS canonical_kpi_name,
         jsonb_agg(jsonb_build_object(
           'kpi_name', v.kpi_name,
           'rows', v.rows_cnt,
           'open_rows', v.open_cnt
         ) ORDER BY v.rows_cnt DESC) AS variants
  FROM per_variant v
  LEFT JOIN public.kra_categories c ON c.id = v.category_id
  GROUP BY v.category_id, c.name, v.kra_name, v.kpi_title
  HAVING COUNT(*) > 1 AND SUM(v.open_cnt) > 0
  ORDER BY COUNT(*) DESC, SUM(v.open_cnt) DESC;
$$;

GRANT EXECUTE ON FUNCTION public.list_split_kpi_name_variants() TO authenticated;