
CREATE OR REPLACE FUNCTION public.rpc_distinct_kpi_periods()
RETURNS TABLE(review_period text, review_year integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT k.review_period, k.review_year
  FROM public.kpis k
  WHERE k.review_period IS NOT NULL
    AND k.review_year IS NOT NULL
    AND public.has_role(auth.uid(), 'admin');
$$;

CREATE OR REPLACE FUNCTION public.rpc_open_query_counts(p_kpi_ids uuid[])
RETURNS TABLE(kpi_id uuid, open_count integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT q.kpi_id, COUNT(*)::int AS open_count
  FROM public.kpi_queries q
  WHERE q.kpi_id = ANY(p_kpi_ids)
    AND q.status = 'open'
    AND q.query_type = 'query'
    AND public.has_role(auth.uid(), 'admin')
  GROUP BY q.kpi_id;
$$;

GRANT EXECUTE ON FUNCTION public.rpc_distinct_kpi_periods() TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_open_query_counts(uuid[]) TO authenticated;
