-- Batch canonical KPI resolver for Phase 2a (Cross-Month Linking)
-- Input: JSONB array of { category_id, kra_name, kpi_name }
-- Output: rows with the input signature plus its canonical definition (or NULL if unmatched)

CREATE OR REPLACE FUNCTION public.resolve_canonical_kpi_batch(
  p_signatures jsonb
)
RETURNS TABLE (
  category_id uuid,
  kra_name text,
  kpi_name text,
  definition_id uuid,
  canonical_kra_name text,
  canonical_kpi_name text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH input AS (
    SELECT
      (elem->>'category_id')::uuid AS category_id,
      elem->>'kra_name'            AS kra_name,
      elem->>'kpi_name'            AS kpi_name
    FROM jsonb_array_elements(COALESCE(p_signatures, '[]'::jsonb)) AS elem
  )
  SELECT
    i.category_id,
    i.kra_name,
    i.kpi_name,
    d.id   AS definition_id,
    d.canonical_kra_name,
    d.canonical_kpi_name
  FROM input i
  LEFT JOIN public.kpi_name_aliases a
    ON a.category_id      = i.category_id
   AND a.variant_kra_name = i.kra_name
   AND a.variant_kpi_name = i.kpi_name
  LEFT JOIN public.kpi_definitions d
    ON d.id = a.definition_id;
$$;

-- Grant execute to authenticated users (read-only function, no data exposure beyond
-- what the kpi_definitions/kpi_name_aliases tables already permit)
GRANT EXECUTE ON FUNCTION public.resolve_canonical_kpi_batch(jsonb) TO authenticated;

COMMENT ON FUNCTION public.resolve_canonical_kpi_batch(jsonb) IS
  'Phase 2a: Batch resolver. Returns canonical definition and canonical names for each input KPI signature. Unmatched signatures get NULL columns. Used by useCanonicalResolver hook for cross-month grouping in dashboards/profiles.';