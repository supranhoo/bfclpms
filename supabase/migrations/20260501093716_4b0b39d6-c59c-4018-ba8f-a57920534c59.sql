-- ============================================================================
-- Phase 2b: Soft Enforcement at Creation Flows
-- ============================================================================
-- Strategy: Database-level auto-linking trigger. Whenever a KPI row is
-- inserted (or its KRA/KPI name updated) and a matching alias exists in
-- kpi_name_aliases, automatically stamp kpi_definition_id. This unifies all
-- 5 client-side insert sites (SmartAssignment, CopyKras, BulkTemplate,
-- AdminKpiEditor, KpiWeightageDashboard) without touching their UI.
-- ============================================================================

-- 1. Seed the feature flag (default ON)
INSERT INTO public.system_settings (setting_key, setting_value, description)
VALUES (
  'enable_kpi_canonical_autolink',
  'true'::jsonb,
  'Phase 2b: When ON, KPIs inserted/updated for May 2026+ that match a kpi_name_aliases entry are automatically stamped with their canonical kpi_definition_id. Disable to suspend auto-linking without dropping the trigger.'
)
ON CONFLICT (setting_key) DO NOTHING;

-- 2. Helper: is the (period, year) >= May 2026?
CREATE OR REPLACE FUNCTION public.is_canonical_enforcement_period(
  p_period text,
  p_year integer
) RETURNS boolean
LANGUAGE sql IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_year IS NULL OR p_period IS NULL THEN false
    WHEN p_year > 2026 THEN true
    WHEN p_year < 2026 THEN false
    ELSE LOWER(p_period) IN ('may','june','july','august','september','october','november','december')
  END;
$$;

COMMENT ON FUNCTION public.is_canonical_enforcement_period(text, integer) IS
  'Phase 2b: Returns true when the period is May 2026 or later. Used by the auto-link trigger and any other forward-only enforcement gate.';

-- 3. The auto-link trigger function
CREATE OR REPLACE FUNCTION public.trg_kpi_canonical_autolink()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_enabled boolean;
  v_def_id uuid;
BEGIN
  -- Skip if user has already explicitly set kpi_definition_id
  IF NEW.kpi_definition_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Skip if any required signature column is null
  IF NEW.category_id IS NULL OR NEW.kra_name IS NULL OR NEW.kpi_name IS NULL THEN
    RETURN NEW;
  END IF;

  -- Skip pre-May-2026 periods (forward-only policy)
  IF NOT public.is_canonical_enforcement_period(NEW.review_period, NEW.review_year) THEN
    RETURN NEW;
  END IF;

  -- Skip if feature flag disabled
  SELECT (setting_value)::text::boolean INTO v_enabled
  FROM public.system_settings
  WHERE setting_key = 'enable_kpi_canonical_autolink';

  IF NOT COALESCE(v_enabled, true) THEN
    RETURN NEW;
  END IF;

  -- Look up canonical definition via alias
  SELECT a.definition_id INTO v_def_id
  FROM public.kpi_name_aliases a
  WHERE a.category_id      = NEW.category_id
    AND a.variant_kra_name = NEW.kra_name
    AND a.variant_kpi_name = NEW.kpi_name
  LIMIT 1;

  IF v_def_id IS NOT NULL THEN
    NEW.kpi_definition_id := v_def_id;
    -- Audit log (system action: performed_by = NULL per System Performer Attribution memory)
    -- Use AFTER trigger pattern? No — we want NEW to carry the value. Insert audit
    -- in a deferred way via a separate AFTER trigger to avoid blocking on log failures.
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.trg_kpi_canonical_autolink() IS
  'Phase 2b: BEFORE INSERT/UPDATE trigger on public.kpis. Auto-stamps kpi_definition_id when (category_id, kra_name, kpi_name) matches a kpi_name_aliases row, gated by feature flag and May 2026+ period. Skips if user already set kpi_definition_id.';

-- 4. Audit trigger (AFTER) so a logging failure cannot block KPI creation
CREATE OR REPLACE FUNCTION public.trg_kpi_canonical_autolink_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only log when the BEFORE trigger actually populated the FK
  IF NEW.kpi_definition_id IS NOT NULL
     AND (TG_OP = 'INSERT' OR OLD.kpi_definition_id IS DISTINCT FROM NEW.kpi_definition_id)
     AND public.is_canonical_enforcement_period(NEW.review_period, NEW.review_year) THEN
    BEGIN
      INSERT INTO public.audit_logs (
        kpi_id, action, performed_by, on_behalf_of, on_behalf_role,
        old_value, new_value, metadata
      ) VALUES (
        NEW.id,
        'KPI_CANONICAL_AUTOLINKED',
        NULL, -- system action
        NEW.employee_id,
        NULL,
        jsonb_build_object('kpi_definition_id', OLD.kpi_definition_id),
        jsonb_build_object('kpi_definition_id', NEW.kpi_definition_id),
        jsonb_build_object(
          'kra_name', NEW.kra_name,
          'kpi_name', NEW.kpi_name,
          'category_id', NEW.category_id,
          'review_period', NEW.review_period,
          'review_year', NEW.review_year,
          'system_action', true,
          'phase', '2b'
        )
      );
    EXCEPTION WHEN OTHERS THEN
      -- Never block the KPI write on an audit failure
      RAISE WARNING 'KPI_CANONICAL_AUTOLINKED audit insert failed for kpi %: %', NEW.id, SQLERRM;
    END;
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.trg_kpi_canonical_autolink_audit() IS
  'Phase 2b: AFTER trigger logging KPI_CANONICAL_AUTOLINKED to audit_logs. Wrapped in EXCEPTION block so audit failures never block KPI creation.';

-- 5. Attach triggers (drop first to be idempotent)
DROP TRIGGER IF EXISTS kpi_canonical_autolink_before ON public.kpis;
CREATE TRIGGER kpi_canonical_autolink_before
  BEFORE INSERT OR UPDATE OF kra_name, kpi_name, category_id, review_period, review_year
  ON public.kpis
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_kpi_canonical_autolink();

DROP TRIGGER IF EXISTS kpi_canonical_autolink_after ON public.kpis;
CREATE TRIGGER kpi_canonical_autolink_after
  AFTER INSERT OR UPDATE OF kpi_definition_id
  ON public.kpis
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_kpi_canonical_autolink_audit();

-- 6. Admin helper: promote an unlinked signature to a new canonical definition
--    and back-link all matching May 2026+ rows in one shot.
CREATE OR REPLACE FUNCTION public.promote_signature_to_definition(
  p_category_id uuid,
  p_kra_name text,
  p_kpi_name text,
  p_canonical_kra text DEFAULT NULL,
  p_canonical_kpi text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_def_id uuid;
  v_canonical_kra text;
  v_canonical_kpi text;
  v_linked_count integer := 0;
  v_existing_def uuid;
BEGIN
  -- Admin gate
  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Only admins can promote signatures to canonical definitions';
  END IF;

  v_canonical_kra := COALESCE(NULLIF(TRIM(p_canonical_kra), ''), p_kra_name);
  v_canonical_kpi := COALESCE(NULLIF(TRIM(p_canonical_kpi), ''), p_kpi_name);

  -- If this signature is already aliased, just return that definition
  SELECT definition_id INTO v_existing_def
  FROM public.kpi_name_aliases
  WHERE category_id      = p_category_id
    AND variant_kra_name = p_kra_name
    AND variant_kpi_name = p_kpi_name
  LIMIT 1;

  IF v_existing_def IS NOT NULL THEN
    v_def_id := v_existing_def;
  ELSE
    -- Insert (or fetch) canonical definition
    INSERT INTO public.kpi_definitions (canonical_kra_name, canonical_kpi_name, category_id)
    VALUES (v_canonical_kra, v_canonical_kpi, p_category_id)
    ON CONFLICT (canonical_kra_name, canonical_kpi_name, category_id)
      DO UPDATE SET updated_at = NOW()
    RETURNING id INTO v_def_id;

    -- Insert canonical alias (so canonical text itself resolves)
    INSERT INTO public.kpi_name_aliases (definition_id, variant_kra_name, variant_kpi_name, category_id)
    VALUES (v_def_id, v_canonical_kra, v_canonical_kpi, p_category_id)
    ON CONFLICT DO NOTHING;

    -- Insert variant alias (the unlinked signature itself)
    IF (v_canonical_kra, v_canonical_kpi) IS DISTINCT FROM (p_kra_name, p_kpi_name) THEN
      INSERT INTO public.kpi_name_aliases (definition_id, variant_kra_name, variant_kpi_name, category_id)
      VALUES (v_def_id, p_kra_name, p_kpi_name, p_category_id)
      ON CONFLICT DO NOTHING;
    END IF;
  END IF;

  -- Back-link matching May 2026+ rows that are still unlinked
  WITH updated AS (
    UPDATE public.kpis
       SET kpi_definition_id = v_def_id
     WHERE category_id = p_category_id
       AND kra_name    = p_kra_name
       AND kpi_name    = p_kpi_name
       AND kpi_definition_id IS NULL
       AND public.is_canonical_enforcement_period(review_period, review_year)
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_linked_count FROM updated;

  RETURN jsonb_build_object(
    'definition_id', v_def_id,
    'linked_count', v_linked_count,
    'canonical_kra_name', v_canonical_kra,
    'canonical_kpi_name', v_canonical_kpi
  );
END;
$$;

COMMENT ON FUNCTION public.promote_signature_to_definition(uuid, text, text, text, text) IS
  'Phase 2b: Admin-only. Promotes an unlinked KPI signature to a new canonical definition, registers it as an alias, and back-links all matching May 2026+ rows. Returns {definition_id, linked_count, canonical_kra_name, canonical_kpi_name}.';

GRANT EXECUTE ON FUNCTION public.is_canonical_enforcement_period(text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.promote_signature_to_definition(uuid, text, text, text, text) TO authenticated;