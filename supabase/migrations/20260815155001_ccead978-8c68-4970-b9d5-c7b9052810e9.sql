CREATE OR REPLACE FUNCTION public.bu_console_generate_merge_proposals(p_fuzzy_threshold numeric DEFAULT 0.55)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_scan jsonb;
  v_inserted integer := 0;
BEGIN
  IF NOT public.has_role(auth.uid(),'admin') THEN
    RAISE EXCEPTION 'Only administrators can generate merge proposals';
  END IF;

  v_scan := public.scan_kpi_duplicate_groups(false, p_fuzzy_threshold);

  WITH groups AS (
    SELECT g FROM jsonb_array_elements(COALESCE(v_scan->'groups', v_scan, '[]'::jsonb)) AS g
  ),
  variants AS (
    SELECT (g->>'category_id')::uuid AS category_id,
           v AS variant,
           row_number() OVER (PARTITION BY g->>'normalized_kpi', g->>'category_id'
                              ORDER BY (v->>'employee_count')::int DESC NULLS LAST) AS rn,
           first_value(v) OVER (PARTITION BY g->>'normalized_kpi', g->>'category_id'
                                ORDER BY (v->>'employee_count')::int DESC NULLS LAST) AS canonical
    FROM groups, jsonb_array_elements(g->'variants') AS v
  ),
  raw_candidates AS (
    SELECT category_id,
           canonical->>'kra_name' AS canonical_kra_name,
           canonical->>'kpi_name' AS canonical_kpi_name,
           variant->>'kra_name' AS variant_kra_name,
           variant->>'kpi_name' AS variant_kpi_name,
           NULLIF(variant->>'similarity','')::numeric AS similarity,
           COALESCE(variant->>'match_type','exact') AS match_type,
           COALESCE((variant->>'row_count')::int,0) AS affected_kpi_count,
           COALESCE((variant->>'employee_count')::int,0) AS affected_employee_count
    FROM variants
    WHERE rn > 1
  ),
  candidates AS (
    -- Collapse variants that normalise to the same proposal key, otherwise a
    -- single scan can conflict with itself on kpi_merge_proposals_pending_uidx.
    SELECT DISTINCT ON (
             COALESCE(category_id,'00000000-0000-0000-0000-000000000000'::uuid),
             normalize_kpi_text(canonical_kra_name),
             normalize_kpi_text(canonical_kpi_name),
             normalize_kpi_text(variant_kra_name),
             normalize_kpi_text(variant_kpi_name)
           ) *
    FROM raw_candidates
    WHERE NOT (
      normalize_kpi_text(canonical_kra_name) = normalize_kpi_text(variant_kra_name)
      AND normalize_kpi_text(canonical_kpi_name) = normalize_kpi_text(variant_kpi_name)
    )
    ORDER BY
      COALESCE(category_id,'00000000-0000-0000-0000-000000000000'::uuid),
      normalize_kpi_text(canonical_kra_name),
      normalize_kpi_text(canonical_kpi_name),
      normalize_kpi_text(variant_kra_name),
      normalize_kpi_text(variant_kpi_name),
      affected_employee_count DESC,
      affected_kpi_count DESC
  )
  INSERT INTO public.kpi_merge_proposals (
    category_id, canonical_kra_name, canonical_kpi_name,
    variant_kra_name, variant_kpi_name, similarity, match_type,
    affected_kpi_count, affected_employee_count
  )
  SELECT category_id, canonical_kra_name, canonical_kpi_name,
         variant_kra_name, variant_kpi_name, similarity, match_type,
         affected_kpi_count, affected_employee_count
  FROM candidates c
  WHERE NOT EXISTS (
    SELECT 1 FROM public.kpi_merge_proposals m
    WHERE COALESCE(m.category_id,'00000000-0000-0000-0000-000000000000'::uuid)
          = COALESCE(c.category_id,'00000000-0000-0000-0000-000000000000'::uuid)
      AND normalize_kpi_text(m.canonical_kra_name) = normalize_kpi_text(c.canonical_kra_name)
      AND normalize_kpi_text(m.canonical_kpi_name) = normalize_kpi_text(c.canonical_kpi_name)
      AND normalize_kpi_text(m.variant_kra_name) = normalize_kpi_text(c.variant_kra_name)
      AND normalize_kpi_text(m.variant_kpi_name) = normalize_kpi_text(c.variant_kpi_name)
      AND m.status = 'pending'
  )
  ON CONFLICT (
    COALESCE(category_id,'00000000-0000-0000-0000-000000000000'::uuid),
    normalize_kpi_text(canonical_kra_name),
    normalize_kpi_text(canonical_kpi_name),
    normalize_kpi_text(variant_kra_name),
    normalize_kpi_text(variant_kpi_name)
  ) WHERE (status = 'pending'::public.kpi_merge_proposal_status)
  DO NOTHING;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  RETURN jsonb_build_object('inserted', v_inserted);
END;
$function$;