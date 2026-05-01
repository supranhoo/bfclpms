-- ============================================================================
-- Phase 4a — Fuzzy Suggestion Engine for Canonical Registry
-- (Retry: previous attempt accidentally defined suggest_alias_candidates twice
--  with different return shapes, which Postgres rejects. Cleaned up here.)
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ----------------------------------------------------------------------------
-- 1. Dismissal table
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.registry_suggestion_dismissals (
  kind          text        NOT NULL CHECK (kind IN ('definition_merge','alias_candidate')),
  left_id       uuid        NOT NULL,
  right_id      uuid        NOT NULL,
  dismissed_by  uuid        NULL,
  dismissed_at  timestamptz NOT NULL DEFAULT now(),
  reason        text        NULL,
  PRIMARY KEY (kind, left_id, right_id)
);

COMMENT ON TABLE public.registry_suggestion_dismissals IS
  'Phase 4a: Admin "not a duplicate" decisions for registry auto-merge suggestions. Anti-joined by suggest_definition_merges and suggest_alias_candidates so dismissed pairs do not reappear.';

ALTER TABLE public.registry_suggestion_dismissals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can read suggestion dismissals" ON public.registry_suggestion_dismissals;
CREATE POLICY "Admins can read suggestion dismissals"
  ON public.registry_suggestion_dismissals
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Admins can insert suggestion dismissals" ON public.registry_suggestion_dismissals;
CREATE POLICY "Admins can insert suggestion dismissals"
  ON public.registry_suggestion_dismissals
  FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Admins can delete suggestion dismissals" ON public.registry_suggestion_dismissals;
CREATE POLICY "Admins can delete suggestion dismissals"
  ON public.registry_suggestion_dismissals
  FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

-- ----------------------------------------------------------------------------
-- 2. suggest_definition_merges
-- ----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.suggest_definition_merges(numeric, integer);
CREATE OR REPLACE FUNCTION public.suggest_definition_merges(
  p_min_similarity numeric DEFAULT 0.55,
  p_limit integer DEFAULT 50
)
RETURNS TABLE (
  left_id                uuid,
  right_id               uuid,
  category_id            uuid,
  category_name          text,
  left_kra_name          text,
  left_kpi_name          text,
  right_kra_name         text,
  right_kpi_name         text,
  similarity             numeric,
  left_alias_count       integer,
  right_alias_count      integer,
  left_linked_kpi_count  integer,
  right_linked_kpi_count integer
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
    p.l_id,
    p.r_id,
    p.cat_id,
    COALESCE(c.name, 'Unknown'),
    dl.canonical_kra_name,
    dl.canonical_kpi_name,
    dr.canonical_kra_name,
    dr.canonical_kpi_name,
    round(p.sim, 4),
    COALESCE(al.cnt, 0),
    COALESCE(ar.cnt, 0),
    COALESCE(ll.cnt, 0),
    COALESCE(lr.cnt, 0)
  FROM pairs p
  JOIN public.kpi_definitions dl ON dl.id = p.l_id
  JOIN public.kpi_definitions dr ON dr.id = p.r_id
  LEFT JOIN public.kra_categories c ON c.id = p.cat_id
  LEFT JOIN alias_counts al  ON al.definition_id = p.l_id
  LEFT JOIN alias_counts ar  ON ar.definition_id = p.r_id
  LEFT JOIN linked_counts ll ON ll.def_id = p.l_id
  LEFT JOIN linked_counts lr ON lr.def_id = p.r_id
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
$$;

COMMENT ON FUNCTION public.suggest_definition_merges(numeric, integer) IS
  'Phase 4a: Admin-only. Returns same-category kpi_definitions pairs with name similarity >= threshold (default 0.55). Pairs canonicalized as (least_id, greatest_id) for stable dismissals. Includes alias and May-2026+ linked-row counts.';

-- ----------------------------------------------------------------------------
-- 3. suggest_alias_candidates
-- ----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.suggest_alias_candidates(numeric, integer);
CREATE OR REPLACE FUNCTION public.suggest_alias_candidates(
  p_min_similarity numeric DEFAULT 0.6,
  p_limit integer DEFAULT 100
)
RETURNS TABLE (
  signature_id        uuid,
  category_id         uuid,
  category_name       text,
  signature_kra_name  text,
  signature_kpi_name  text,
  occurrence_count    integer,
  last_seen           timestamptz,
  definition_id       uuid,
  canonical_kra_name  text,
  canonical_kpi_name  text,
  similarity          numeric
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
  IF p_min_similarity IS NULL OR p_min_similarity < 0 OR p_min_similarity > 1 THEN
    RAISE EXCEPTION 'p_min_similarity must be between 0 and 1';
  END IF;

  RETURN QUERY
  WITH unlinked AS (
    SELECT
      k.category_id,
      k.kra_name,
      k.kpi_name,
      COUNT(*)::int     AS occurrence_count,
      MAX(k.created_at) AS last_seen
    FROM public.kpis k
    WHERE k.kpi_definition_id IS NULL
      AND k.category_id IS NOT NULL
      AND k.kra_name   IS NOT NULL
      AND k.kpi_name   IS NOT NULL
      AND public.is_canonical_enforcement_period(k.review_period, k.review_year)
    GROUP BY k.category_id, k.kra_name, k.kpi_name
  ),
  scored AS (
    SELECT
      u.category_id,
      u.kra_name,
      u.kpi_name,
      u.occurrence_count,
      u.last_seen,
      d.id                  AS def_id,
      d.canonical_kra_name,
      d.canonical_kpi_name,
      similarity(
        u.kra_name || ' ' || u.kpi_name,
        d.canonical_kra_name || ' ' || d.canonical_kpi_name
      )::numeric AS sim,
      ROW_NUMBER() OVER (
        PARTITION BY u.category_id, u.kra_name, u.kpi_name
        ORDER BY similarity(
          u.kra_name || ' ' || u.kpi_name,
          d.canonical_kra_name || ' ' || d.canonical_kpi_name
        ) DESC, d.id
      ) AS rn
    FROM unlinked u
    JOIN public.kpi_definitions d ON d.category_id = u.category_id
  )
  SELECT
    (md5(s.category_id::text || '|' || s.kra_name || '|' || s.kpi_name))::uuid AS signature_id,
    s.category_id,
    COALESCE(c.name, 'Unknown') AS category_name,
    s.kra_name,
    s.kpi_name,
    s.occurrence_count,
    s.last_seen,
    s.def_id,
    s.canonical_kra_name,
    s.canonical_kpi_name,
    round(s.sim, 4)
  FROM scored s
  LEFT JOIN public.kra_categories c ON c.id = s.category_id
  WHERE s.rn = 1
    AND s.sim >= p_min_similarity
    AND NOT EXISTS (
      SELECT 1 FROM public.registry_suggestion_dismissals d
      WHERE d.kind = 'alias_candidate'
        AND d.left_id  = (md5(s.category_id::text || '|' || s.kra_name || '|' || s.kpi_name))::uuid
        AND d.right_id = s.def_id
    )
  ORDER BY s.sim DESC, s.occurrence_count DESC
  LIMIT GREATEST(p_limit, 0);
END;
$$;

COMMENT ON FUNCTION public.suggest_alias_candidates(numeric, integer) IS
  'Phase 4a: Admin-only. For each May-2026+ unlinked signature, returns its best-matching same-category canonical definition when similarity >= threshold (default 0.6). signature_id is a deterministic uuid derived from md5(category|kra|kpi).';

-- ----------------------------------------------------------------------------
-- 4. dismiss_suggestion
-- ----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.dismiss_suggestion(text, uuid, uuid, text);
CREATE OR REPLACE FUNCTION public.dismiss_suggestion(
  p_kind text,
  p_left_id uuid,
  p_right_id uuid,
  p_reason text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'access denied';
  END IF;
  IF p_kind NOT IN ('definition_merge','alias_candidate') THEN
    RAISE EXCEPTION 'invalid kind: %', p_kind;
  END IF;
  IF p_left_id IS NULL OR p_right_id IS NULL THEN
    RAISE EXCEPTION 'left_id and right_id are required';
  END IF;

  IF p_kind = 'definition_merge' AND p_left_id > p_right_id THEN
    INSERT INTO public.registry_suggestion_dismissals (kind, left_id, right_id, dismissed_by, reason)
    VALUES (p_kind, p_right_id, p_left_id, auth.uid(), p_reason)
    ON CONFLICT (kind, left_id, right_id) DO NOTHING;
  ELSE
    INSERT INTO public.registry_suggestion_dismissals (kind, left_id, right_id, dismissed_by, reason)
    VALUES (p_kind, p_left_id, p_right_id, auth.uid(), p_reason)
    ON CONFLICT (kind, left_id, right_id) DO NOTHING;
  END IF;
END;
$$;

COMMENT ON FUNCTION public.dismiss_suggestion(text, uuid, uuid, text) IS
  'Phase 4a: Admin-only. Records a "not a duplicate" decision. Idempotent. For definition_merge, normalizes the pair to (least_id, greatest_id).';

-- ----------------------------------------------------------------------------
-- 5. Permissions
-- ----------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.suggest_definition_merges(numeric, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.suggest_alias_candidates(numeric, integer)  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.dismiss_suggestion(text, uuid, uuid, text)  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.suggest_definition_merges(numeric, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.suggest_alias_candidates(numeric, integer)  TO authenticated;
GRANT EXECUTE ON FUNCTION public.dismiss_suggestion(text, uuid, uuid, text)  TO authenticated;