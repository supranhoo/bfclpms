-- ADR-273 — surface mis-split KPI titles instead of shipping them as distinct KPIs.

CREATE OR REPLACE FUNCTION public.kpi_title_is_suspect(p_title text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT p_title IS NOT NULL
     AND (
       length(btrim(p_title)) > 120
       OR p_title ~* '(=\s*[0-5]\b|scoring\s+logic|formula\s*:)'
       OR p_title ~* '\((jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s*-'
     );
$$;

GRANT EXECUTE ON FUNCTION public.kpi_title_is_suspect(text) TO authenticated, service_role;

DROP FUNCTION IF EXISTS public.kpi_split_grouped_dry_run(integer, integer, text, text);

CREATE FUNCTION public.kpi_split_grouped_dry_run(
  p_limit integer DEFAULT 25,
  p_offset integer DEFAULT 0,
  p_confidence text DEFAULT NULL,
  p_state text DEFAULT NULL,
  p_search text DEFAULT NULL
)
RETURNS TABLE(
  kpi_name text, sample_kpi_id uuid, row_count bigint, pending_count bigint,
  structured_count bigint, kra_sample text, title text, description text,
  formula text, scoring_logic text, confidence text, total_groups bigint
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_search text := NULLIF(btrim(coalesce(p_search, '')), '');
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Only admins can preview the KPI text split';
  END IF;

  RETURN QUERY
  WITH src AS (
    SELECT k.id, k.kra_name, k.kpi_name,
           k.kpi_title IS NOT NULL AS split_done,
           public.kpi_title_is_suspect(k.kpi_title) AS suspect_title,
           s.title, s.description, s.formula, s.scoring_logic, s.confidence
    FROM public.kpis k
    CROSS JOIN LATERAL public.kpi_split_text(k.kpi_name) s
    WHERE public.kpi_fiscal_start_year(k.review_period, k.review_year) >= 2026
      AND (v_search IS NULL OR k.kpi_name ILIKE '%' || v_search || '%')
  ), filtered AS (
    SELECT * FROM src
    WHERE (p_confidence IS NULL OR p_confidence = 'all' OR src.confidence = p_confidence)
      AND (
        p_state IS NULL OR p_state = 'all'
        OR (p_state = 'pending' AND NOT src.split_done)
        OR (p_state = 'structured' AND src.split_done)
        OR (p_state = 'suspect' AND src.split_done AND src.suspect_title)
      )
  ), grouped AS (
    SELECT f.kpi_name,
           (array_agg(f.id ORDER BY f.split_done, f.id))[1] AS sample_kpi_id,
           count(*) AS row_count,
           count(*) FILTER (WHERE NOT f.split_done) AS pending_count,
           count(*) FILTER (WHERE f.split_done) AS structured_count,
           (array_agg(f.kra_name ORDER BY f.kra_name))[1] AS kra_sample,
           min(f.title) AS title,
           min(f.description) AS description,
           min(f.formula) AS formula,
           min(f.scoring_logic) AS scoring_logic,
           min(f.confidence) AS confidence
    FROM filtered f
    GROUP BY f.kpi_name
  )
  SELECT g.kpi_name, g.sample_kpi_id, g.row_count, g.pending_count, g.structured_count,
         g.kra_sample, g.title, g.description, g.formula, g.scoring_logic, g.confidence,
         (SELECT count(*) FROM grouped)
  FROM grouped g
  ORDER BY g.pending_count DESC, g.row_count DESC, g.kpi_name
  LIMIT greatest(1, least(coalesce(p_limit, 25), 200))
  OFFSET greatest(0, coalesce(p_offset, 0));
END;
$function$;

GRANT EXECUTE ON FUNCTION public.kpi_split_grouped_dry_run(integer, integer, text, text, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.kpi_split_summary()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Only admins can read the KPI text split summary';
  END IF;

  SELECT jsonb_build_object(
    'cutover_fiscal_start_year', 2026,
    'in_scope', count(*),
    'distinct_names', count(DISTINCT k.kpi_name),
    'high', count(*) FILTER (WHERE s.confidence = 'high'),
    'review', count(*) FILTER (WHERE s.confidence = 'review'),
    'unparsed', count(*) FILTER (WHERE s.confidence IN ('unparsed','empty')),
    'already_split', count(*) FILTER (WHERE k.kpi_title IS NOT NULL),
    'pending', count(*) FILTER (WHERE k.kpi_title IS NULL AND s.title IS NOT NULL),
    'pending_high', count(*) FILTER (WHERE k.kpi_title IS NULL AND s.confidence = 'high' AND s.title IS NOT NULL),
    'pending_review', count(*) FILTER (WHERE k.kpi_title IS NULL AND s.confidence = 'review' AND s.title IS NOT NULL),
    'pending_unparsed', count(*) FILTER (WHERE k.kpi_title IS NULL AND s.confidence IN ('unparsed','empty') AND s.title IS NOT NULL),
    'needs_manual', count(*) FILTER (WHERE k.kpi_title IS NULL AND s.title IS NULL),
    'needs_manual_groups', count(DISTINCT k.kpi_name) FILTER (WHERE k.kpi_title IS NULL AND s.title IS NULL),
    'pending_groups', count(DISTINCT k.kpi_name) FILTER (WHERE k.kpi_title IS NULL),
    'suspect_titles', count(*) FILTER (WHERE public.kpi_title_is_suspect(k.kpi_title)),
    'suspect_title_groups', count(DISTINCT k.kpi_name) FILTER (WHERE public.kpi_title_is_suspect(k.kpi_title)),
    'legacy_untouched', (SELECT count(*) FROM public.kpis lk
                          WHERE coalesce(public.kpi_fiscal_start_year(lk.review_period, lk.review_year), 0) < 2026)
  )
  INTO v
  FROM public.kpis k
  CROSS JOIN LATERAL public.kpi_split_text(k.kpi_name) s
  WHERE public.kpi_fiscal_start_year(k.review_period, k.review_year) >= 2026;

  RETURN v;
END;
$function$;