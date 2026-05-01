
-- Phase 2c: Registry Health & Coverage RPCs
-- Period filter helper: only count May 2026+ rows for "in-scope" stats.
-- We use month name → month number mapping to align with is_canonical_enforcement_period().

-- 1) Coverage stats: how many in-scope KPI rows are linked to a canonical definition.
CREATE OR REPLACE FUNCTION public.get_registry_coverage_stats()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total_defs integer;
  v_total_aliases integer;
  v_inscope_total integer;
  v_inscope_linked integer;
  v_inscope_unlinked integer;
  v_distinct_signatures integer;
BEGIN
  IF NOT has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'access denied';
  END IF;

  SELECT COUNT(*) INTO v_total_defs FROM public.kpi_definitions;
  SELECT COUNT(*) INTO v_total_aliases FROM public.kpi_name_aliases;

  WITH inscope AS (
    SELECT k.id, k.kpi_definition_id, k.category_id, k.kra_name, k.kpi_name
    FROM public.kpis k
    WHERE public.is_canonical_enforcement_period(k.review_period, k.review_year)
  )
  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE kpi_definition_id IS NOT NULL),
    COUNT(*) FILTER (WHERE kpi_definition_id IS NULL),
    COUNT(DISTINCT (category_id, lower(btrim(kra_name)), lower(btrim(kpi_name))))
  INTO v_inscope_total, v_inscope_linked, v_inscope_unlinked, v_distinct_signatures
  FROM inscope;

  RETURN jsonb_build_object(
    'total_definitions', v_total_defs,
    'total_aliases', v_total_aliases,
    'inscope_kpis_total', v_inscope_total,
    'inscope_kpis_linked', v_inscope_linked,
    'inscope_kpis_unlinked', v_inscope_unlinked,
    'inscope_distinct_signatures', v_distinct_signatures,
    'coverage_pct', CASE WHEN v_inscope_total > 0
      THEN round((v_inscope_linked::numeric / v_inscope_total::numeric) * 100, 2)
      ELSE 0 END
  );
END;
$$;

-- 2) Unlinked signatures queue: distinct (category, kra, kpi) tuples in-scope without a definition.
CREATE OR REPLACE FUNCTION public.get_unlinked_signatures(p_limit integer DEFAULT 100)
RETURNS TABLE (
  category_id uuid,
  category_name text,
  kra_name text,
  kpi_name text,
  occurrence_count bigint,
  employee_count bigint,
  last_seen timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'access denied';
  END IF;

  RETURN QUERY
  SELECT
    k.category_id,
    c.name AS category_name,
    k.kra_name,
    k.kpi_name,
    COUNT(*)::bigint AS occurrence_count,
    COUNT(DISTINCT k.employee_id)::bigint AS employee_count,
    MAX(k.updated_at) AS last_seen
  FROM public.kpis k
  JOIN public.kra_categories c ON c.id = k.category_id
  WHERE k.kpi_definition_id IS NULL
    AND public.is_canonical_enforcement_period(k.review_period, k.review_year)
  GROUP BY k.category_id, c.name, k.kra_name, k.kpi_name
  ORDER BY occurrence_count DESC, last_seen DESC
  LIMIT p_limit;
END;
$$;

-- 3) Alias drift detection: definitions whose aliases share KPI names across different KRAs
-- (often a sign of mis-grouping). Returns suspicious clusters for admin review.
CREATE OR REPLACE FUNCTION public.detect_alias_drift()
RETURNS TABLE (
  definition_id uuid,
  canonical_kra_name text,
  canonical_kpi_name text,
  category_id uuid,
  category_name text,
  variant_kra_count integer,
  variant_kra_names text[],
  alias_count integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'access denied';
  END IF;

  RETURN QUERY
  SELECT
    d.id AS definition_id,
    d.canonical_kra_name,
    d.canonical_kpi_name,
    d.category_id,
    c.name AS category_name,
    COUNT(DISTINCT lower(btrim(a.variant_kra_name)))::integer AS variant_kra_count,
    ARRAY_AGG(DISTINCT a.variant_kra_name ORDER BY a.variant_kra_name) AS variant_kra_names,
    COUNT(a.id)::integer AS alias_count
  FROM public.kpi_definitions d
  JOIN public.kra_categories c ON c.id = d.category_id
  JOIN public.kpi_name_aliases a ON a.definition_id = d.id
  GROUP BY d.id, d.canonical_kra_name, d.canonical_kpi_name, d.category_id, c.name
  HAVING COUNT(DISTINCT lower(btrim(a.variant_kra_name))) > 1
  ORDER BY variant_kra_count DESC, alias_count DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_registry_coverage_stats() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_unlinked_signatures(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.detect_alias_drift() TO authenticated;
