-- ADR-269b1: duplicate-aware KPI text split

CREATE OR REPLACE FUNCTION public.kpi_split_grouped_dry_run(
  p_limit integer DEFAULT 25,
  p_offset integer DEFAULT 0,
  p_confidence text DEFAULT NULL,
  p_state text DEFAULT NULL
)
RETURNS TABLE(
  kpi_name text,
  sample_kpi_id uuid,
  row_count bigint,
  pending_count bigint,
  structured_count bigint,
  kra_sample text,
  title text,
  description text,
  formula text,
  scoring_logic text,
  confidence text,
  total_groups bigint
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Only admins can preview the KPI text split';
  END IF;

  RETURN QUERY
  WITH src AS (
    SELECT k.id, k.kra_name, k.kpi_name,
           k.kpi_title IS NOT NULL AS split_done,
           s.title, s.description, s.formula, s.scoring_logic, s.confidence
    FROM public.kpis k
    CROSS JOIN LATERAL public.kpi_split_text(k.kpi_name) s
    WHERE public.kpi_fiscal_start_year(k.review_period, k.review_year) >= 2026
  ), filtered AS (
    SELECT * FROM src
    WHERE (p_confidence IS NULL OR p_confidence = 'all' OR src.confidence = p_confidence)
      AND (
        p_state IS NULL OR p_state = 'all'
        OR (p_state = 'pending' AND NOT src.split_done)
        OR (p_state = 'structured' AND src.split_done)
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

CREATE OR REPLACE FUNCTION public.kpi_split_set_parts_by_name(
  p_kpi_name text,
  p_title text,
  p_description text DEFAULT NULL,
  p_formula text DEFAULT NULL,
  p_scoring_logic text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_run uuid := gen_random_uuid();
  v_ws constant text := E' \t\r\n';
  v_title text := NULLIF(btrim(coalesce(p_title, ''), v_ws), '');
  v_desc text := NULLIF(btrim(coalesce(p_description, ''), v_ws), '');
  v_formula text := NULLIF(btrim(coalesce(p_formula, ''), v_ws), '');
  v_scoring text := NULLIF(btrim(coalesce(p_scoring_logic, ''), v_ws), '');
  v_count integer := 0;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Only admins can edit KPI structured text';
  END IF;
  IF v_title IS NULL THEN
    RAISE EXCEPTION 'A title is required';
  END IF;

  INSERT INTO public.kpi_text_split_audit
    (run_id, kpi_id, review_period, review_year, kpi_name, before_parts, after_parts, confidence, performed_by)
  SELECT v_run, k.id, k.review_period, k.review_year, k.kpi_name,
         jsonb_build_object('title', k.kpi_title, 'description', k.kpi_description,
                            'formula', k.kpi_formula, 'scoring_logic', k.kpi_scoring_logic),
         jsonb_build_object('title', v_title, 'description', v_desc,
                            'formula', v_formula, 'scoring_logic', v_scoring),
         'manual_group', auth.uid()
  FROM public.kpis k
  WHERE k.kpi_name = p_kpi_name
    AND public.kpi_fiscal_start_year(k.review_period, k.review_year) >= 2026;

  UPDATE public.kpis k
  SET kpi_title = v_title,
      kpi_description = v_desc,
      kpi_formula = v_formula,
      kpi_scoring_logic = v_scoring
  WHERE k.kpi_name = p_kpi_name
    AND public.kpi_fiscal_start_year(k.review_period, k.review_year) >= 2026;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN jsonb_build_object('run_id', v_run, 'updated', v_count);
END;
$function$;

CREATE OR REPLACE FUNCTION public.kpi_split_summary()
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
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