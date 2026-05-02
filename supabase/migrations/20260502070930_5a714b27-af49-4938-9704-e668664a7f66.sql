-- Ensure pg_trgm is available for similarity matching
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Trigram index on normalized KPI name to keep fuzzy matching fast
CREATE INDEX IF NOT EXISTS kpis_kpi_name_trgm_idx
  ON public.kpis USING gin (LOWER(TRIM(kpi_name)) gin_trgm_ops);

-- Drop old strict-equality version (returns jsonb) so we can replace cleanly
DROP FUNCTION IF EXISTS public.scan_kpi_duplicate_groups(boolean);

CREATE OR REPLACE FUNCTION public.scan_kpi_duplicate_groups(
  p_include_skipped boolean DEFAULT false,
  p_fuzzy_threshold numeric DEFAULT 0.55
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_result JSONB;
  v_thresh numeric := GREATEST(0.20, LEAST(0.95, COALESCE(p_fuzzy_threshold, 0.55)));
BEGIN
  -- 1. Distinct unaliased (category, kra, kpi) tuples with usage stats
  WITH sub AS (
    SELECT
      k.category_id              AS cat_id,
      k.kra_name,
      k.kpi_name,
      LOWER(TRIM(k.kpi_name))    AS norm_kpi,
      COUNT(DISTINCT k.employee_id) AS emp_count,
      COUNT(*)                   AS row_count
    FROM public.kpis k
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.kpi_name_aliases a
      WHERE a.category_id = k.category_id
        AND LOWER(TRIM(a.variant_kra_name)) = LOWER(TRIM(k.kra_name))
        AND LOWER(TRIM(a.variant_kpi_name)) = LOWER(TRIM(k.kpi_name))
    )
    GROUP BY k.category_id, k.kra_name, k.kpi_name
  ),
  -- 2. Pairwise similarity within the same category
  pairs AS (
    SELECT
      a.cat_id,
      a.norm_kpi      AS a_norm,
      b.norm_kpi      AS b_norm,
      similarity(a.norm_kpi, b.norm_kpi) AS sim
    FROM sub a
    JOIN sub b
      ON a.cat_id = b.cat_id
     AND a.norm_kpi <> b.norm_kpi
     AND a.norm_kpi < b.norm_kpi   -- avoid duplicate ordered pairs
    WHERE similarity(a.norm_kpi, b.norm_kpi) >= v_thresh
  ),
  -- 3. Union-Find via recursive CTE: pick the lexicographically smallest
  --    norm_kpi reachable from each node as its cluster representative.
  edges AS (
    SELECT cat_id, a_norm AS x, b_norm AS y FROM pairs
    UNION ALL
    SELECT cat_id, b_norm AS x, a_norm AS y FROM pairs
    UNION ALL
    SELECT cat_id, norm_kpi, norm_kpi FROM sub  -- self edges so singletons survive
  ),
  -- For each (cat, node), the minimum reachable node within depth 4 hops
  -- (clusters of similar names are typically tight; 4 hops is plenty).
  reach AS (
    SELECT cat_id, x, y, 1 AS depth FROM edges
    UNION ALL
    SELECT e.cat_id, e.x, r.y, r.depth + 1
    FROM edges e
    JOIN reach r ON r.cat_id = e.cat_id AND r.x = e.y
    WHERE r.depth < 4
  ),
  rep AS (
    SELECT cat_id, x AS norm_kpi, MIN(y) AS rep_norm
    FROM reach
    GROUP BY cat_id, x
  ),
  -- 4. Tag each sub row with its cluster representative + match type
  tagged AS (
    SELECT
      s.cat_id,
      s.kra_name,
      s.kpi_name,
      s.norm_kpi,
      s.emp_count,
      s.row_count,
      COALESCE(r.rep_norm, s.norm_kpi) AS rep_norm,
      CASE WHEN COALESCE(r.rep_norm, s.norm_kpi) = s.norm_kpi
           THEN 'exact'::text ELSE 'fuzzy'::text END AS match_type,
      CASE WHEN COALESCE(r.rep_norm, s.norm_kpi) = s.norm_kpi
           THEN 1.0
           ELSE COALESCE(similarity(s.norm_kpi, COALESCE(r.rep_norm, s.norm_kpi)), 0)
      END AS sim_to_rep
    FROM sub s
    LEFT JOIN rep r ON r.cat_id = s.cat_id AND r.norm_kpi = s.norm_kpi
  ),
  -- 5. Aggregate per (cat, representative) cluster
  grouped AS (
    SELECT
      t.rep_norm AS norm_kpi,
      t.cat_id,
      COALESCE(c.name, 'Unknown') AS cat_name,
      jsonb_agg(
        jsonb_build_object(
          'kra_name',       t.kra_name,
          'kpi_name',       t.kpi_name,
          'employee_count', t.emp_count,
          'row_count',      t.row_count,
          'match_type',     t.match_type,
          'similarity',     ROUND(t.sim_to_rep::numeric, 2)
        )
        ORDER BY t.match_type, t.kra_name, t.kpi_name
      ) AS variants,
      COUNT(*)                              AS variant_count,
      COUNT(DISTINCT t.kra_name)            AS distinct_kras,
      COUNT(*) FILTER (WHERE t.match_type = 'fuzzy') AS fuzzy_count,
      SUM(t.row_count)                      AS total_rows,
      EXISTS (
        SELECT 1 FROM public.kpi_scanner_skips sk
        WHERE sk.category_id = t.cat_id
          AND sk.normalized_kpi = t.rep_norm
      ) AS is_skipped
    FROM tagged t
    LEFT JOIN public.kra_categories c ON c.id = t.cat_id
    GROUP BY t.rep_norm, t.cat_id, c.name
    -- A group is interesting if either:
    --   (a) the same KPI name exists under multiple KRAs (legacy rule), or
    --   (b) two or more name variants cluster together via fuzzy match.
    HAVING COUNT(DISTINCT t.kra_name) > 1
        OR COUNT(*) > 1
  )
  SELECT jsonb_agg(
    jsonb_build_object(
      'normalized_kpi', norm_kpi,
      'category_id',    cat_id,
      'category_name',  cat_name,
      'variants',       variants,
      'is_skipped',     is_skipped,
      'has_fuzzy',      fuzzy_count > 0
    )
    ORDER BY (fuzzy_count > 0) ASC, total_rows DESC  -- exact-only groups first
  )
  INTO v_result
  FROM grouped
  WHERE (p_include_skipped OR NOT is_skipped);

  RETURN COALESCE(v_result, '[]'::jsonb);
END;
$function$;

-- Re-grant execute to authenticated role (DROP wipes grants)
GRANT EXECUTE ON FUNCTION public.scan_kpi_duplicate_groups(boolean, numeric) TO authenticated;