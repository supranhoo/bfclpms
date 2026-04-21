-- =============================================================================
-- v2.66.6 — Auto-Inherit Org KPI Status on New KPI Creation
-- =============================================================================

-- 1. Feature flag column on app_settings
ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS enable_org_kpi_auto_inherit boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.app_settings.enable_org_kpi_auto_inherit IS
  'When ON, any new KPI matching an existing Org KPI signature (category + KRA + KPI name + period) auto-inherits is_org_level=true and the matching org_level_scope.';

-- =============================================================================
-- 2. BEFORE INSERT trigger function: auto-inherit org-level status
-- =============================================================================
CREATE OR REPLACE FUNCTION public.trg_autoinherit_org_level_on_kpi_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_enabled boolean;
  v_sibling RECORD;
BEGIN
  -- Skip if already org-level
  IF NEW.is_org_level IS TRUE THEN
    RETURN NEW;
  END IF;

  -- Required fields for signature match
  IF NEW.category_id IS NULL
     OR NEW.kra_name IS NULL
     OR NEW.kpi_name IS NULL
     OR NEW.review_period IS NULL
     OR NEW.review_year IS NULL THEN
    RETURN NEW;
  END IF;

  -- Feature flag gate
  SELECT enable_org_kpi_auto_inherit INTO v_enabled
  FROM app_settings
  WHERE id = '00000000-0000-0000-0000-000000000001';

  IF v_enabled IS NOT TRUE THEN
    RETURN NEW;
  END IF;

  -- Find a sibling KPI with same signature that IS org-level
  SELECT id, org_level_scope
  INTO v_sibling
  FROM kpis
  WHERE category_id = NEW.category_id
    AND lower(trim(kra_name)) = lower(trim(NEW.kra_name))
    AND lower(trim(kpi_name)) = lower(trim(NEW.kpi_name))
    AND review_period = NEW.review_period
    AND review_year = NEW.review_year
    AND is_org_level = true
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  -- Inherit
  NEW.is_org_level := true;
  NEW.org_level_scope := v_sibling.org_level_scope;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_autoinherit_org_level_on_kpi_insert ON public.kpis;
CREATE TRIGGER trg_autoinherit_org_level_on_kpi_insert
  BEFORE INSERT ON public.kpis
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_autoinherit_org_level_on_kpi_insert();

-- =============================================================================
-- 3. AFTER INSERT companion: audit-log inheritance events
--    (kept separate so audit-log INSERT doesn't block the kpis INSERT
--     and so we can reference NEW.id which only exists post-insert)
-- =============================================================================
CREATE OR REPLACE FUNCTION public.trg_audit_org_level_inheritance()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sibling_id uuid;
BEGIN
  -- Only log if this row is org-level. We can't easily know if it
  -- was inherited vs explicitly set, so we only log when there's a
  -- pre-existing sibling (i.e., this row inherited from one).
  IF NEW.is_org_level IS NOT TRUE THEN
    RETURN NEW;
  END IF;

  SELECT id INTO v_sibling_id
  FROM kpis
  WHERE category_id = NEW.category_id
    AND lower(trim(kra_name)) = lower(trim(NEW.kra_name))
    AND lower(trim(kpi_name)) = lower(trim(NEW.kpi_name))
    AND review_period = NEW.review_period
    AND review_year = NEW.review_year
    AND is_org_level = true
    AND id <> NEW.id
    AND created_at < NEW.created_at
  ORDER BY created_at ASC
  LIMIT 1;

  IF v_sibling_id IS NULL THEN
    RETURN NEW; -- This is the originator, not an inheritor
  END IF;

  INSERT INTO kpi_audit_logs (kpi_id, action, performed_by, metadata)
  VALUES (
    NEW.id,
    'ORG_KPI_AUTO_INHERITED',
    NULL, -- system performer
    jsonb_build_object(
      'source_kpi_id', v_sibling_id,
      'inherited_scope', NEW.org_level_scope,
      'category_id', NEW.category_id,
      'kra_name', NEW.kra_name,
      'kpi_name', NEW.kpi_name,
      'review_period', NEW.review_period,
      'review_year', NEW.review_year
    )
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_org_level_inheritance ON public.kpis;
CREATE TRIGGER trg_audit_org_level_inheritance
  AFTER INSERT ON public.kpis
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_audit_org_level_inheritance();

-- =============================================================================
-- 4. Admin reconciler RPC: bulk-fix existing non-inherited KPIs
-- =============================================================================
CREATE OR REPLACE FUNCTION public.reconcile_org_kpi_inheritance(
  p_dry_run boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_is_admin boolean;
  v_candidates jsonb;
  v_count integer := 0;
  v_updated integer := 0;
BEGIN
  -- Admin-only
  SELECT EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = v_user AND role = 'admin'
  ) INTO v_is_admin;

  IF NOT v_is_admin THEN
    RAISE EXCEPTION 'Admin access required';
  END IF;

  -- Build candidate list: KPIs that are not org-level but have an
  -- org-level sibling with the same signature.
  WITH cand AS (
    SELECT
      k.id              AS kpi_id,
      k.kpi_name,
      k.kra_name,
      k.review_period,
      k.review_year,
      k.employee_id,
      p.full_name       AS employee_name,
      sib.id            AS sibling_id,
      sib.org_level_scope AS inherit_scope
    FROM kpis k
    JOIN kpis sib
      ON sib.category_id = k.category_id
     AND lower(trim(sib.kra_name)) = lower(trim(k.kra_name))
     AND lower(trim(sib.kpi_name)) = lower(trim(k.kpi_name))
     AND sib.review_period = k.review_period
     AND sib.review_year = k.review_year
     AND sib.is_org_level = true
     AND sib.id <> k.id
    LEFT JOIN profiles p ON p.id = k.employee_id
    WHERE k.is_org_level IS NOT TRUE
  )
  SELECT
    COUNT(*),
    jsonb_agg(jsonb_build_object(
      'kpi_id', kpi_id,
      'kpi_name', kpi_name,
      'kra_name', kra_name,
      'review_period', review_period,
      'review_year', review_year,
      'employee_id', employee_id,
      'employee_name', employee_name,
      'sibling_id', sibling_id,
      'inherit_scope', inherit_scope
    ))
  INTO v_count, v_candidates
  FROM cand;

  IF p_dry_run OR v_count = 0 THEN
    RETURN jsonb_build_object(
      'dry_run', p_dry_run,
      'candidate_count', COALESCE(v_count, 0),
      'candidates', COALESCE(v_candidates, '[]'::jsonb),
      'updated', 0
    );
  END IF;

  -- Apply updates
  WITH cand AS (
    SELECT
      k.id AS kpi_id,
      sib.org_level_scope AS inherit_scope,
      sib.id AS sibling_id
    FROM kpis k
    JOIN kpis sib
      ON sib.category_id = k.category_id
     AND lower(trim(sib.kra_name)) = lower(trim(k.kra_name))
     AND lower(trim(sib.kpi_name)) = lower(trim(k.kpi_name))
     AND sib.review_period = k.review_period
     AND sib.review_year = k.review_year
     AND sib.is_org_level = true
     AND sib.id <> k.id
    WHERE k.is_org_level IS NOT TRUE
  ),
  upd AS (
    UPDATE kpis k
    SET is_org_level = true,
        org_level_scope = c.inherit_scope,
        updated_at = now()
    FROM cand c
    WHERE k.id = c.kpi_id
    RETURNING k.id, c.sibling_id, c.inherit_scope
  )
  INSERT INTO kpi_audit_logs (kpi_id, action, performed_by, metadata)
  SELECT
    upd.id,
    'ORG_KPI_INHERITANCE_RECONCILED',
    v_user,
    jsonb_build_object(
      'source_kpi_id', upd.sibling_id,
      'inherited_scope', upd.inherit_scope,
      'reconciled_by', v_user
    )
  FROM upd;

  GET DIAGNOSTICS v_updated = ROW_COUNT;

  RETURN jsonb_build_object(
    'dry_run', false,
    'candidate_count', v_count,
    'candidates', v_candidates,
    'updated', v_updated
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.reconcile_org_kpi_inheritance(boolean) TO authenticated;