DROP FUNCTION IF EXISTS public.scan_kpi_duplicate_groups(boolean, numeric);

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
  -- 2. Distinct normalised names per category (cluster nodes)
  nodes AS (
    SELECT DISTINCT cat_id, norm_kpi
    FROM sub
  ),
  -- 3. For each node, find the lexicographically smallest "buddy" within the
  --    same category whose similarity meets the threshold (or itself).
  --    LATERAL keeps this as a single bounded scan per node — no recursion.
  rep AS (
    SELECT
      n.cat_id,
      n.norm_kpi,
      COALESCE(buddy.rep_norm, n.norm_kpi) AS rep_norm
    FROM nodes n
    LEFT JOIN LATERAL (
      SELECT m.norm_kpi AS rep_norm
      FROM nodes m
      WHERE m.cat_id = n.cat_id
        AND m.norm_kpi <= n.norm_kpi
        AND (m.norm_kpi = n.norm_kpi OR similarity(m.norm_kpi, n.norm_kpi) >= v_thresh)
      ORDER BY m.norm_kpi ASC
      LIMIT 1
    ) buddy ON true
  ),
  -- 4. Tag each variant with its representative + match metadata
  tagged AS (
    SELECT
      s.cat_id,
      s.kra_name,
      s.kpi_name,
      s.norm_kpi,
      s.emp_count,
      s.row_count,
      r.rep_norm,
      CASE WHEN r.rep_norm = s.norm_kpi THEN 'exact'::text ELSE 'fuzzy'::text END AS match_type,
      CASE WHEN r.rep_norm = s.norm_kpi THEN 1.0
           ELSE COALESCE(similarity(s.norm_kpi, r.rep_norm), 0)
      END AS sim_to_rep
    FROM sub s
    JOIN rep r ON r.cat_id = s.cat_id AND r.norm_kpi = s.norm_kpi
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
      COUNT(*) FILTER (WHERE t.match_type = 'fuzzy') AS fuzzy_count,
      COUNT(DISTINCT t.kra_name) AS distinct_kras,
      COUNT(*) AS variant_count,
      SUM(t.row_count) AS total_rows,
      EXISTS (
        SELECT 1 FROM public.kpi_scanner_skips sk
        WHERE sk.category_id = t.cat_id
          AND sk.normalized_kpi = t.rep_norm
      ) AS is_skipped
    FROM tagged t
    LEFT JOIN public.kra_categories c ON c.id = t.cat_id
    GROUP BY t.rep_norm, t.cat_id, c.name
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
    ORDER BY (fuzzy_count > 0) ASC, total_rows DESC
  )
  INTO v_result
  FROM grouped
  WHERE (p_include_skipped OR NOT is_skipped);

  RETURN COALESCE(v_result, '[]'::jsonb);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.scan_kpi_duplicate_groups(boolean, numeric) TO authenticated;