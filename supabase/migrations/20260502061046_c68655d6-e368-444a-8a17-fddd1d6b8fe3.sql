-- =========================================================
-- 1. kpi_scanner_skips table
-- =========================================================
CREATE TABLE public.kpi_scanner_skips (
  id              UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  category_id     UUID NOT NULL REFERENCES public.kra_categories(id) ON DELETE CASCADE,
  normalized_kpi  TEXT NOT NULL,
  skipped_by      UUID,
  skipped_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  reason          TEXT,
  CONSTRAINT kpi_scanner_skips_unique UNIQUE (category_id, normalized_kpi)
);

CREATE INDEX idx_kpi_scanner_skips_cat ON public.kpi_scanner_skips(category_id);

ALTER TABLE public.kpi_scanner_skips ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view skips"
  ON public.kpi_scanner_skips
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can insert skips"
  ON public.kpi_scanner_skips
  FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete skips"
  ON public.kpi_scanner_skips
  FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- (No UPDATE policy — entries are immutable, remove + re-add to change.)

COMMENT ON TABLE public.kpi_scanner_skips IS
  'Admin-marked duplicate groups to permanently skip from the KPI standardization scanner.';

-- =========================================================
-- 2. Rewrite scan_kpi_duplicate_groups with alias + skip filters
-- =========================================================
DROP FUNCTION IF EXISTS public.scan_kpi_duplicate_groups();
DROP FUNCTION IF EXISTS public.scan_kpi_duplicate_groups(boolean);

CREATE OR REPLACE FUNCTION public.scan_kpi_duplicate_groups(p_include_skipped boolean DEFAULT false)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSONB;
BEGIN
  WITH sub AS (
    SELECT
      k.category_id,
      k.kra_name,
      k.kpi_name,
      COUNT(DISTINCT k.employee_id) AS emp_count,
      COUNT(*) AS row_count
    FROM public.kpis k
    WHERE NOT EXISTS (
      -- Hide variants that are already linked to a canonical via aliases
      SELECT 1
      FROM public.kpi_name_aliases a
      WHERE a.category_id = k.category_id
        AND LOWER(TRIM(a.variant_kra_name)) = LOWER(TRIM(k.kra_name))
        AND LOWER(TRIM(a.variant_kpi_name)) = LOWER(TRIM(k.kpi_name))
    )
    GROUP BY k.category_id, k.kra_name, k.kpi_name
  ),
  grouped AS (
    SELECT
      LOWER(TRIM(s.kpi_name)) AS norm_kpi,
      s.category_id           AS cat_id,
      COALESCE(c.name, 'Unknown') AS cat_name,
      jsonb_agg(
        jsonb_build_object(
          'kra_name',       s.kra_name,
          'kpi_name',       s.kpi_name,
          'employee_count', s.emp_count,
          'row_count',      s.row_count
        )
        ORDER BY s.kra_name, s.kpi_name
      ) AS variants,
      SUM(s.row_count) AS total_rows,
      EXISTS (
        SELECT 1 FROM public.kpi_scanner_skips sk
        WHERE sk.category_id = s.category_id
          AND sk.normalized_kpi = LOWER(TRIM(s.kpi_name))
      ) AS is_skipped
    FROM sub s
    LEFT JOIN public.kra_categories c ON c.id = s.category_id
    GROUP BY LOWER(TRIM(s.kpi_name)), s.category_id, c.name
    HAVING COUNT(DISTINCT s.kra_name) > 1
  )
  SELECT jsonb_agg(
    jsonb_build_object(
      'normalized_kpi', norm_kpi,
      'category_id',    cat_id,
      'category_name',  cat_name,
      'variants',       variants,
      'is_skipped',     is_skipped
    )
    ORDER BY total_rows DESC
  )
  INTO v_result
  FROM grouped
  WHERE (p_include_skipped OR NOT is_skipped);

  RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;

COMMENT ON FUNCTION public.scan_kpi_duplicate_groups(boolean) IS
  'Returns duplicate KPI groups for admin review. Excludes variants already linked to a canonical via kpi_name_aliases. Excludes groups in kpi_scanner_skips unless p_include_skipped = true.';

-- =========================================================
-- 3. Allow new action_type values for skip / unskip
-- =========================================================
-- The existing log table accepts free-text action_type via the
-- log_standardization_action() RPC. Patch reverse_standardization_action
-- so it understands the new types.

CREATE OR REPLACE FUNCTION public.reverse_standardization_action(p_action_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_action public.kpi_standardization_actions%ROWTYPE;
  v_uid uuid := auth.uid();
BEGIN
  IF NOT public.has_role(v_uid, 'admin'::app_role) THEN
    RAISE EXCEPTION 'Only admins can reverse standardization actions';
  END IF;

  SELECT * INTO v_action FROM public.kpi_standardization_actions WHERE id = p_action_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Action not found';
  END IF;
  IF v_action.reversed_at IS NOT NULL THEN
    RAISE EXCEPTION 'Action already reversed';
  END IF;

  IF v_action.action_type = 'create_definition' THEN
    IF EXISTS (SELECT 1 FROM public.kpis WHERE kpi_definition_id = v_action.definition_id) THEN
      RAISE EXCEPTION 'Cannot reverse: KPIs still reference this definition';
    END IF;
    DELETE FROM public.kpi_name_aliases WHERE definition_id = v_action.definition_id;
    DELETE FROM public.kpi_definitions WHERE id = v_action.definition_id;

  ELSIF v_action.action_type = 'link_alias' THEN
    DELETE FROM public.kpi_name_aliases a
    USING jsonb_array_elements(v_action.payload->'aliases') AS al
    WHERE a.definition_id = v_action.definition_id
      AND LOWER(TRIM(a.variant_kra_name)) = LOWER(TRIM(al->>'variant_kra_name'))
      AND LOWER(TRIM(a.variant_kpi_name)) = LOWER(TRIM(al->>'variant_kpi_name'))
      AND a.category_id = (al->>'category_id')::uuid;

  ELSIF v_action.action_type = 'unlink_alias' THEN
    INSERT INTO public.kpi_name_aliases (definition_id, variant_kra_name, variant_kpi_name, category_id)
    SELECT v_action.definition_id, al->>'variant_kra_name', al->>'variant_kpi_name', (al->>'category_id')::uuid
    FROM jsonb_array_elements(v_action.payload->'aliases') AS al
    ON CONFLICT DO NOTHING;

  ELSIF v_action.action_type = 'delete_definition' THEN
    INSERT INTO public.kpi_definitions (id, canonical_kra_name, canonical_kpi_name, category_id)
    SELECT
      (v_action.payload->'definition'->>'id')::uuid,
      v_action.payload->'definition'->>'canonical_kra_name',
      v_action.payload->'definition'->>'canonical_kpi_name',
      (v_action.payload->'definition'->>'category_id')::uuid
    ON CONFLICT (id) DO NOTHING;
    INSERT INTO public.kpi_name_aliases (definition_id, variant_kra_name, variant_kpi_name, category_id)
    SELECT
      (v_action.payload->'definition'->>'id')::uuid,
      al->>'variant_kra_name',
      al->>'variant_kpi_name',
      (al->>'category_id')::uuid
    FROM jsonb_array_elements(COALESCE(v_action.payload->'aliases', '[]'::jsonb)) AS al
    ON CONFLICT DO NOTHING;

  ELSIF v_action.action_type = 'edit_definition' THEN
    UPDATE public.kpi_definitions
    SET canonical_kra_name = v_action.payload->'before'->>'canonical_kra_name',
        canonical_kpi_name = v_action.payload->'before'->>'canonical_kpi_name'
    WHERE id = v_action.definition_id;

  ELSIF v_action.action_type = 'rename_kpis' THEN
    -- Existing rename undo: rely on per-row before image
    PERFORM 1; -- handled by existing logic in earlier migration; left no-op here to avoid double-revert
    RAISE EXCEPTION 'Use the existing rename undo path';

  ELSIF v_action.action_type = 'skip_group' THEN
    DELETE FROM public.kpi_scanner_skips
    WHERE category_id   = (v_action.payload->>'category_id')::uuid
      AND normalized_kpi = v_action.payload->>'normalized_kpi';

  ELSIF v_action.action_type = 'unskip_group' THEN
    INSERT INTO public.kpi_scanner_skips (category_id, normalized_kpi, skipped_by, reason)
    VALUES (
      (v_action.payload->>'category_id')::uuid,
      v_action.payload->>'normalized_kpi',
      v_uid,
      v_action.payload->>'reason'
    )
    ON CONFLICT (category_id, normalized_kpi) DO NOTHING;

  ELSE
    RAISE EXCEPTION 'Unknown action_type: %', v_action.action_type;
  END IF;

  UPDATE public.kpi_standardization_actions
  SET reversed_at = now(), reversed_by = v_uid
  WHERE id = p_action_id;

  RETURN jsonb_build_object('ok', true, 'action_type', v_action.action_type);
END;
$$;