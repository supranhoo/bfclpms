-- ADR-354 — cross-category split of one structured KPI title.
-- Read-only companion to list_split_kpi_name_variants() (ADR-352a), which only
-- looks within a single category and therefore missed KPIs whose rows sit under
-- two different categories ("Production" vs "Production & Operations").
CREATE OR REPLACE FUNCTION public.list_cross_category_kpi_title_splits()
RETURNS TABLE(
  kra_name text,
  kpi_title text,
  category_count integer,
  open_rows integer,
  total_rows integer,
  categories jsonb
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH scoped AS (
    SELECT k.category_id, k.kra_name, k.kpi_title, k.kpi_name,
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
  ), per_category AS (
    SELECT s.kra_name, s.kpi_title, s.category_id,
           COUNT(*)::int AS rows_cnt,
           COUNT(*) FILTER (WHERE s.is_open)::int AS open_cnt,
           COUNT(DISTINCT s.kpi_name)::int AS name_variants
    FROM scoped s
    GROUP BY 1,2,3
  )
  SELECT p.kra_name,
         p.kpi_title,
         COUNT(*)::int AS category_count,
         SUM(p.open_cnt)::int AS open_rows,
         SUM(p.rows_cnt)::int AS total_rows,
         jsonb_agg(jsonb_build_object(
           'category_id', p.category_id,
           'category_name', c.name,
           'rows', p.rows_cnt,
           'open_rows', p.open_cnt,
           'name_variants', p.name_variants
         ) ORDER BY p.rows_cnt DESC) AS categories
  FROM per_category p
  LEFT JOIN public.kra_categories c ON c.id = p.category_id
  GROUP BY p.kra_name, p.kpi_title
  HAVING COUNT(*) > 1 AND SUM(p.open_cnt) > 0
  ORDER BY COUNT(*) DESC, SUM(p.open_cnt) DESC;
$function$;

REVOKE ALL ON FUNCTION public.list_cross_category_kpi_title_splits() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_cross_category_kpi_title_splits() TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_cross_category_kpi_title_splits() TO service_role;