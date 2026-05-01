-- =============================================================================
-- Phase 4c: Transactional merge engine + registry audit log
-- =============================================================================

-- 1. Immutable audit log for registry-level admin actions ---------------------
CREATE TABLE IF NOT EXISTS public.kpi_registry_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action text NOT NULL,                  -- e.g. 'KPI_DEFINITION_MERGED'
  performed_by uuid REFERENCES public.profiles(id),
  category_id uuid,
  primary_definition_id uuid,            -- the surviving definition (nullable so log survives later deletes)
  affected_definition_id uuid,           -- the dropped definition
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_registry_audit_action ON public.kpi_registry_audit_log(action);
CREATE INDEX IF NOT EXISTS idx_registry_audit_created ON public.kpi_registry_audit_log(created_at DESC);

ALTER TABLE public.kpi_registry_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view registry audit log" ON public.kpi_registry_audit_log;
CREATE POLICY "Admins can view registry audit log"
  ON public.kpi_registry_audit_log
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Admins can insert registry audit log" ON public.kpi_registry_audit_log;
CREATE POLICY "Admins can insert registry audit log"
  ON public.kpi_registry_audit_log
  FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- No UPDATE / DELETE policies — table is append-only.

-- 2. Transactional merge_definitions RPC -------------------------------------
CREATE OR REPLACE FUNCTION public.merge_definitions(
  p_keep_id uuid,
  p_drop_id uuid,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_keep RECORD;
  v_drop RECORD;
  v_reparented_aliases int := 0;
  v_dropped_alias_conflicts int := 0;
  v_repointed_kpis int := 0;
  v_backfill_alias_id uuid;
BEGIN
  IF NOT has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Only administrators can merge KPI definitions';
  END IF;

  IF p_keep_id IS NULL OR p_drop_id IS NULL OR p_keep_id = p_drop_id THEN
    RAISE EXCEPTION 'merge_definitions requires two distinct definition IDs';
  END IF;

  -- Lock both rows (consistent order to avoid deadlock)
  IF p_keep_id < p_drop_id THEN
    SELECT * INTO v_keep FROM kpi_definitions WHERE id = p_keep_id FOR UPDATE;
    SELECT * INTO v_drop FROM kpi_definitions WHERE id = p_drop_id FOR UPDATE;
  ELSE
    SELECT * INTO v_drop FROM kpi_definitions WHERE id = p_drop_id FOR UPDATE;
    SELECT * INTO v_keep FROM kpi_definitions WHERE id = p_keep_id FOR UPDATE;
  END IF;

  IF v_keep.id IS NULL THEN RAISE EXCEPTION 'Kept definition % not found', p_keep_id; END IF;
  IF v_drop.id IS NULL THEN RAISE EXCEPTION 'Dropped definition % not found', p_drop_id; END IF;
  IF v_keep.category_id <> v_drop.category_id THEN
    RAISE EXCEPTION 'Cannot merge definitions across categories (% vs %)', v_keep.category_id, v_drop.category_id;
  END IF;

  -- Re-parent aliases of dropped def to kept def, skipping rows that would
  -- collide with an existing alias on the kept side (those are dropped as
  -- redundant; the kept-side alias already covers the variant).
  WITH conflicting AS (
    SELECT a.id
    FROM kpi_name_aliases a
    WHERE a.definition_id = v_drop.id
      AND EXISTS (
        SELECT 1 FROM kpi_name_aliases b
        WHERE b.definition_id = v_keep.id
          AND b.category_id = a.category_id
          AND b.variant_kra_name = a.variant_kra_name
          AND b.variant_kpi_name = a.variant_kpi_name
      )
  ), del AS (
    DELETE FROM kpi_name_aliases WHERE id IN (SELECT id FROM conflicting) RETURNING 1
  )
  SELECT count(*) INTO v_dropped_alias_conflicts FROM del;

  WITH upd AS (
    UPDATE kpi_name_aliases
       SET definition_id = v_keep.id
     WHERE definition_id = v_drop.id
    RETURNING 1
  )
  SELECT count(*) INTO v_reparented_aliases FROM upd;

  -- Backfill alias for the dropped canonical text, so signatures matching
  -- the dropped name still resolve to the kept definition. Skip if it
  -- already exists on the kept side (or anywhere, due to UNIQUE).
  IF NOT EXISTS (
    SELECT 1 FROM kpi_name_aliases
    WHERE category_id = v_drop.category_id
      AND variant_kra_name = v_drop.canonical_kra_name
      AND variant_kpi_name = v_drop.canonical_kpi_name
  ) THEN
    INSERT INTO kpi_name_aliases (definition_id, category_id, variant_kra_name, variant_kpi_name)
    VALUES (v_keep.id, v_drop.category_id, v_drop.canonical_kra_name, v_drop.canonical_kpi_name)
    RETURNING id INTO v_backfill_alias_id;
  END IF;

  -- Re-point any KPIs linked to the dropped definition.
  WITH rep AS (
    UPDATE kpis SET kpi_definition_id = v_keep.id
    WHERE kpi_definition_id = v_drop.id
    RETURNING 1
  )
  SELECT count(*) INTO v_repointed_kpis FROM rep;

  -- Delete the dropped definition. Cascades have already been handled.
  DELETE FROM kpi_definitions WHERE id = v_drop.id;

  -- Audit
  INSERT INTO kpi_registry_audit_log(
    action, performed_by, category_id,
    primary_definition_id, affected_definition_id, reason, payload
  ) VALUES (
    'KPI_DEFINITION_MERGED',
    auth.uid(),
    v_keep.category_id,
    v_keep.id,
    v_drop.id,
    p_reason,
    jsonb_build_object(
      'kept', jsonb_build_object(
        'id', v_keep.id,
        'kra_name', v_keep.canonical_kra_name,
        'kpi_name', v_keep.canonical_kpi_name
      ),
      'dropped', jsonb_build_object(
        'id', v_drop.id,
        'kra_name', v_drop.canonical_kra_name,
        'kpi_name', v_drop.canonical_kpi_name
      ),
      'reparented_aliases', v_reparented_aliases,
      'dropped_alias_conflicts', v_dropped_alias_conflicts,
      'repointed_kpis', v_repointed_kpis,
      'backfill_alias_id', v_backfill_alias_id
    )
  );

  -- Auto-dismiss this suggestion pair so it does not resurface.
  PERFORM dismiss_suggestion('definition_merge', p_keep_id, p_drop_id, 'auto: merged');

  RETURN jsonb_build_object(
    'success', true,
    'kept_id', v_keep.id,
    'dropped_id', v_drop.id,
    'reparented_aliases', v_reparented_aliases,
    'dropped_alias_conflicts', v_dropped_alias_conflicts,
    'repointed_kpis', v_repointed_kpis,
    'backfill_alias_id', v_backfill_alias_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.merge_definitions(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.merge_definitions(uuid, uuid, text) TO authenticated;

-- 3. Pending suggestion count helper for the Health tile ---------------------
CREATE OR REPLACE FUNCTION public.get_registry_pending_suggestion_count()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_merge int := 0;
  v_alias int := 0;
BEGIN
  IF NOT has_role(auth.uid(), 'admin'::app_role) THEN
    RETURN jsonb_build_object('merge_count', 0, 'alias_count', 0, 'total', 0);
  END IF;

  SELECT count(*) INTO v_merge
  FROM (SELECT * FROM suggest_definition_merges(0.55, 1000)) m;

  SELECT count(*) INTO v_alias
  FROM (SELECT * FROM suggest_alias_candidates(0.6, 1000)) a;

  RETURN jsonb_build_object(
    'merge_count', v_merge,
    'alias_count', v_alias,
    'total', v_merge + v_alias
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_registry_pending_suggestion_count() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_registry_pending_suggestion_count() TO authenticated;