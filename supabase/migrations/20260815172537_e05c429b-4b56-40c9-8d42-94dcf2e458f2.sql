CREATE OR REPLACE FUNCTION public.kpi_split_apply(p_ids uuid[] DEFAULT NULL::uuid[], p_limit integer DEFAULT 1000, p_confidence text DEFAULT 'high'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_run uuid := gen_random_uuid();
  v_applied integer := 0;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Only admins can apply the KPI text split';
  END IF;

  WITH target AS (
    SELECT k.id, k.review_period, k.review_year, k.kpi_name,
           k.kpi_title, k.kpi_description, k.kpi_formula, k.kpi_scoring_logic,
           s.title, s.description, s.formula, s.scoring_logic, s.confidence
    FROM public.kpis k
    CROSS JOIN LATERAL public.kpi_split_text(k.kpi_name) s
    WHERE public.kpi_fiscal_start_year(k.review_period, k.review_year) >= 2026
      AND (p_ids IS NULL OR k.id = ANY(p_ids))
      AND (p_ids IS NOT NULL OR k.kpi_title IS NULL)
      AND (p_confidence IS NULL OR s.confidence = p_confidence)
      AND s.title IS NOT NULL
    ORDER BY k.review_year, k.kra_name, k.kpi_name
    LIMIT greatest(1, least(coalesce(p_limit, 1000), 20000))
  ), upd AS (
    UPDATE public.kpis k
    SET kpi_title = t.title,
        kpi_description = t.description,
        kpi_formula = t.formula,
        kpi_scoring_logic = t.scoring_logic
    FROM target t
    WHERE k.id = t.id
    RETURNING t.*
  ), logged AS (
    INSERT INTO public.kpi_text_split_audit
      (run_id, kpi_id, review_period, review_year, kpi_name, before_parts, after_parts, confidence, performed_by)
    SELECT v_run, u.id, u.review_period, u.review_year, u.kpi_name,
           jsonb_build_object('title', u.kpi_title, 'description', u.kpi_description,
                              'formula', u.kpi_formula, 'scoring_logic', u.kpi_scoring_logic),
           jsonb_build_object('title', u.title, 'description', u.description,
                              'formula', u.formula, 'scoring_logic', u.scoring_logic),
           u.confidence, auth.uid()
    FROM upd u
    RETURNING 1
  )
  SELECT count(*) INTO v_applied FROM logged;

  RETURN jsonb_build_object('run_id', v_run, 'applied', v_applied, 'confidence', p_confidence);
END;
$function$;

CREATE OR REPLACE FUNCTION public.kpi_split_dry_run(p_limit integer DEFAULT 100, p_offset integer DEFAULT 0, p_confidence text DEFAULT NULL::text, p_state text DEFAULT NULL::text)
 RETURNS TABLE(kpi_id uuid, review_period text, review_year integer, kra_name text, kpi_name text, title text, description text, formula text, scoring_logic text, confidence text, already_split boolean, total_count bigint)
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
    SELECT k.id, k.review_period, k.review_year, k.kra_name, k.kpi_name,
           k.kpi_title IS NOT NULL AS split_done,
           s.title, s.description, s.formula, s.scoring_logic, s.confidence
    FROM public.kpis k
    CROSS JOIN LATERAL public.kpi_split_text(k.kpi_name) s
    WHERE public.kpi_fiscal_start_year(k.review_period, k.review_year) >= 2026
  ), filtered AS (
    SELECT * FROM src
    WHERE (p_confidence IS NULL OR src.confidence = p_confidence)
      AND (
        p_state IS NULL OR p_state = 'all'
        OR (p_state = 'pending' AND NOT src.split_done)
        OR (p_state = 'structured' AND src.split_done)
      )
  )
  SELECT f.id, f.review_period, f.review_year, f.kra_name, f.kpi_name,
         f.title, f.description, f.formula, f.scoring_logic, f.confidence,
         f.split_done, (SELECT count(*) FROM filtered)
  FROM filtered f
  ORDER BY f.review_year, f.kra_name, f.kpi_name
  LIMIT greatest(1, least(coalesce(p_limit, 100), 500))
  OFFSET greatest(0, coalesce(p_offset, 0));
END;
$function$;

DROP FUNCTION IF EXISTS public.kpi_split_dry_run(integer, integer, text);

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