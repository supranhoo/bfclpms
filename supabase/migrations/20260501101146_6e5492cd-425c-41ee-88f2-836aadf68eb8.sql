-- Phase 3c: Read-only registry visibility for non-admin roles.
--
-- New SECURITY DEFINER RPC `get_public_registry_view()` that returns the
-- canonical KPI taxonomy (definitions + aliases + per-definition usage
-- count for the in-scope May-2026+ period) WITHOUT exposing employee
-- identifiers, scores, or any other sensitive performance data.
--
-- Visible to all authenticated users (the page-level role gate is enforced
-- in ProtectedRoute / sidebar). Anonymous callers are denied so the registry
-- cannot be scraped from public Supabase endpoints.
--
-- Also seeds a menu_access_config row for the new `registry-browser` menu
-- key so admins can adjust per-role visibility from the existing menu admin UI.

CREATE OR REPLACE FUNCTION public.get_public_registry_view(p_search text DEFAULT NULL, p_category_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_result jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'access denied';
  END IF;

  WITH defs AS (
    SELECT
      d.id,
      d.canonical_kra_name,
      d.canonical_kpi_name,
      d.category_id,
      c.name AS category_name,
      c.color AS category_color
    FROM public.kpi_definitions d
    LEFT JOIN public.kra_categories c ON c.id = d.category_id
    WHERE
      (p_category_id IS NULL OR d.category_id = p_category_id)
      AND (
        p_search IS NULL
        OR p_search = ''
        OR lower(d.canonical_kra_name) LIKE '%' || lower(p_search) || '%'
        OR lower(d.canonical_kpi_name) LIKE '%' || lower(p_search) || '%'
      )
  ),
  aliases AS (
    SELECT
      a.definition_id,
      jsonb_agg(
        jsonb_build_object(
          'kra_name', a.variant_kra_name,
          'kpi_name', a.variant_kpi_name
        )
        ORDER BY a.variant_kra_name, a.variant_kpi_name
      ) AS alias_pairs
    FROM public.kpi_name_aliases a
    WHERE a.definition_id IN (SELECT id FROM defs)
    GROUP BY a.definition_id
  ),
  usage AS (
    SELECT
      k.kpi_definition_id AS definition_id,
      COUNT(*) AS usage_count
    FROM public.kpis k
    WHERE
      k.kpi_definition_id IN (SELECT id FROM defs)
      AND public.is_canonical_enforcement_period(k.review_period, k.review_year)
    GROUP BY k.kpi_definition_id
  )
  SELECT jsonb_build_object(
    'definitions', COALESCE(jsonb_agg(
      jsonb_build_object(
        'id', d.id,
        'canonical_kra_name', d.canonical_kra_name,
        'canonical_kpi_name', d.canonical_kpi_name,
        'category_id', d.category_id,
        'category_name', d.category_name,
        'category_color', d.category_color,
        'aliases', COALESCE(a.alias_pairs, '[]'::jsonb),
        'alias_count', COALESCE(jsonb_array_length(a.alias_pairs), 0),
        'usage_count', COALESCE(u.usage_count, 0)
      )
      ORDER BY d.category_name NULLS LAST, d.canonical_kra_name, d.canonical_kpi_name
    ), '[]'::jsonb),
    'total_count', (SELECT COUNT(*) FROM defs)
  ) INTO v_result
  FROM defs d
  LEFT JOIN aliases a ON a.definition_id = d.id
  LEFT JOIN usage u ON u.definition_id = d.id;

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.get_public_registry_view(text, uuid) IS
'Phase 3c: Read-only canonical KPI taxonomy view for non-admin roles. Returns definitions, aliases, and aggregate usage counts only — never exposes employee identifiers, scores, or other performance data. Authenticated users only; page-level role gate is enforced in the client ProtectedRoute.';

GRANT EXECUTE ON FUNCTION public.get_public_registry_view(text, uuid) TO authenticated;

INSERT INTO public.menu_access_config (menu_key, menu_name, section, allowed_roles, display_order)
SELECT
  'registry-browser',
  'KPI Registry Browser',
  'main',
  ARRAY['admin', 'manager', 'hr_pms', 'management', 'auditor', 'skip_level']::text[],
  COALESCE((SELECT MAX(display_order) + 1 FROM public.menu_access_config), 100)
WHERE NOT EXISTS (SELECT 1 FROM public.menu_access_config WHERE menu_key = 'registry-browser');