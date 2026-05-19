DROP FUNCTION IF EXISTS public.suggest_definition_merges(numeric, integer);

CREATE OR REPLACE FUNCTION public.suggest_definition_merges(p_min_similarity numeric DEFAULT 0.55, p_limit integer DEFAULT 50)
 RETURNS TABLE(
   left_id uuid, right_id uuid, category_id uuid, category_name text,
   left_kra_name text, left_kpi_name text,
   right_kra_name text, right_kpi_name text,
   similarity numeric,
   left_alias_count integer, right_alias_count integer,
   left_linked_kpi_count integer, right_linked_kpi_count integer,
   left_frequency text, left_frequency_mixed boolean,
   left_r0 text, left_r1 text, left_r2 text, left_r3 text, left_r4 text, left_r5 text,
   left_r_mixed boolean,
   right_frequency text, right_frequency_mixed boolean,
   right_r0 text, right_r1 text, right_r2 text, right_r3 text, right_r4 text, right_r5 text,
   right_r_mixed boolean
 )
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'access denied';
  END IF;
  IF p_min_similarity IS NULL OR p_min_similarity < 0 OR p_min_similarity > 1 THEN
    RAISE EXCEPTION 'p_min_similarity must be between 0 and 1';
  END IF;

  RETURN QUERY
  WITH alias_counts AS (
    SELECT a.definition_id, COUNT(*)::int AS cnt
    FROM public.kpi_name_aliases a
    GROUP BY a.definition_id
  ),
  linked_counts AS (
    SELECT k.kpi_definition_id AS def_id, COUNT(*)::int AS cnt
    FROM public.kpis k
    WHERE k.kpi_definition_id IS NOT NULL
      AND public.is_canonical_enforcement_period(k.review_period, k.review_year)
    GROUP BY k.kpi_definition_id
  ),
  def_attrs AS (
    SELECT
      sub.def_id,
      (SELECT frequency FROM (
         SELECT frequency, COUNT(*) c FROM public.kpis
         WHERE kpi_definition_id = sub.def_id AND frequency IS NOT NULL
         GROUP BY frequency ORDER BY c DESC, frequency LIMIT 1
       ) f) AS freq_mode,
      (SELECT COUNT(DISTINCT frequency) FROM public.kpis
        WHERE kpi_definition_id = sub.def_id AND frequency IS NOT NULL) > 1 AS freq_mixed,
      (SELECT r0 FROM (SELECT r0, COUNT(*) c FROM public.kpis WHERE kpi_definition_id = sub.def_id AND r0 IS NOT NULL GROUP BY r0 ORDER BY c DESC, r0 LIMIT 1) x) AS r0_mode,
      (SELECT r1 FROM (SELECT r1, COUNT(*) c FROM public.kpis WHERE kpi_definition_id = sub.def_id AND r1 IS NOT NULL GROUP BY r1 ORDER BY c DESC, r1 LIMIT 1) x) AS r1_mode,
      (SELECT r2 FROM (SELECT r2, COUNT(*) c FROM public.kpis WHERE kpi_definition_id = sub.def_id AND r2 IS NOT NULL GROUP BY r2 ORDER BY c DESC, r2 LIMIT 1) x) AS r2_mode,
      (SELECT r3 FROM (SELECT r3, COUNT(*) c FROM public.kpis WHERE kpi_definition_id = sub.def_id AND r3 IS NOT NULL GROUP BY r3 ORDER BY c DESC, r3 LIMIT 1) x) AS r3_mode,
      (SELECT r4 FROM (SELECT r4, COUNT(*) c FROM public.kpis WHERE kpi_definition_id = sub.def_id AND r4 IS NOT NULL GROUP BY r4 ORDER BY c DESC, r4 LIMIT 1) x) AS r4_mode,
      (SELECT r5 FROM (SELECT r5, COUNT(*) c FROM public.kpis WHERE kpi_definition_id = sub.def_id AND r5 IS NOT NULL GROUP BY r5 ORDER BY c DESC, r5 LIMIT 1) x) AS r5_mode,
      (
        (SELECT COUNT(DISTINCT r0) FROM public.kpis WHERE kpi_definition_id = sub.def_id AND r0 IS NOT NULL) > 1 OR
        (SELECT COUNT(DISTINCT r1) FROM public.kpis WHERE kpi_definition_id = sub.def_id AND r1 IS NOT NULL) > 1 OR
        (SELECT COUNT(DISTINCT r2) FROM public.kpis WHERE kpi_definition_id = sub.def_id AND r2 IS NOT NULL) > 1 OR
        (SELECT COUNT(DISTINCT r3) FROM public.kpis WHERE kpi_definition_id = sub.def_id AND r3 IS NOT NULL) > 1 OR
        (SELECT COUNT(DISTINCT r4) FROM public.kpis WHERE kpi_definition_id = sub.def_id AND r4 IS NOT NULL) > 1 OR
        (SELECT COUNT(DISTINCT r5) FROM public.kpis WHERE kpi_definition_id = sub.def_id AND r5 IS NOT NULL) > 1
      ) AS r_mixed
    FROM (SELECT DISTINCT kpi_definition_id AS def_id FROM public.kpis WHERE kpi_definition_id IS NOT NULL) sub
  ),
  pairs AS (
    SELECT
      LEAST(d1.id, d2.id)    AS l_id,
      GREATEST(d1.id, d2.id) AS r_id,
      d1.category_id         AS cat_id,
      similarity(
        d1.canonical_kra_name || ' ' || d1.canonical_kpi_name,
        d2.canonical_kra_name || ' ' || d2.canonical_kpi_name
      )::numeric AS sim
    FROM public.kpi_definitions d1
    JOIN public.kpi_definitions d2
      ON d1.category_id = d2.category_id
     AND d1.id < d2.id
  )
  SELECT
    p.l_id, p.r_id, p.cat_id,
    COALESCE(c.name, 'Unknown'),
    dl.canonical_kra_name, dl.canonical_kpi_name,
    dr.canonical_kra_name, dr.canonical_kpi_name,
    round(p.sim, 4),
    COALESCE(al.cnt, 0), COALESCE(ar.cnt, 0),
    COALESCE(ll.cnt, 0), COALESCE(lr.cnt, 0),
    dal.freq_mode, COALESCE(dal.freq_mixed, false),
    dal.r0_mode, dal.r1_mode, dal.r2_mode, dal.r3_mode, dal.r4_mode, dal.r5_mode,
    COALESCE(dal.r_mixed, false),
    dar.freq_mode, COALESCE(dar.freq_mixed, false),
    dar.r0_mode, dar.r1_mode, dar.r2_mode, dar.r3_mode, dar.r4_mode, dar.r5_mode,
    COALESCE(dar.r_mixed, false)
  FROM pairs p
  JOIN public.kpi_definitions dl ON dl.id = p.l_id
  JOIN public.kpi_definitions dr ON dr.id = p.r_id
  LEFT JOIN public.kra_categories c ON c.id = p.cat_id
  LEFT JOIN alias_counts al  ON al.definition_id = p.l_id
  LEFT JOIN alias_counts ar  ON ar.definition_id = p.r_id
  LEFT JOIN linked_counts ll ON ll.def_id = p.l_id
  LEFT JOIN linked_counts lr ON lr.def_id = p.r_id
  LEFT JOIN def_attrs dal    ON dal.def_id = p.l_id
  LEFT JOIN def_attrs dar    ON dar.def_id = p.r_id
  WHERE p.sim >= p_min_similarity
    AND NOT EXISTS (
      SELECT 1 FROM public.registry_suggestion_dismissals d
      WHERE d.kind = 'definition_merge'
        AND d.left_id  = p.l_id
        AND d.right_id = p.r_id
    )
  ORDER BY p.sim DESC, p.l_id, p.r_id
  LIMIT GREATEST(p_limit, 0);
END;
$function$;