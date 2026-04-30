-- =====================================================================
-- IAC Phase 2.A — has_role / has_safety_role compatibility shims
-- =====================================================================
-- These rewrites are strictly additive: legacy tables remain authoritative
-- AND the new iac_user_role_assignments table is consulted in parallel.

-- ---------------------------------------------------------------------
-- has_role(_user_id uuid, _role app_role) -> boolean
-- Maps app_role enum -> iac_roles.code, then OR-checks new + legacy.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    -- 1) Legacy authoritative source
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = _user_id AND role = _role
    )
    OR
    -- 2) New IAC source (any active assignment, any scope) for the
    --    matching iac_roles.code. Mapping mirrors Phase 1 seed.
    EXISTS (
      SELECT 1
      FROM public.iac_user_role_assignments ura
      JOIN public.iac_roles r ON r.id = ura.role_id
      WHERE ura.user_id = _user_id
        AND r.is_active = true
        AND (ura.expires_at IS NULL OR ura.expires_at > now())
        AND r.code = CASE _role::text
          WHEN 'admin'      THEN 'pms_admin'
          WHEN 'manager'    THEN 'pms_manager'
          WHEN 'employee'   THEN 'pms_employee'
          WHEN 'auditor'    THEN 'pms_auditor'
          WHEN 'management' THEN 'pms_management'
          WHEN 'hr_pms'     THEN 'pms_hr'
          WHEN 'skip_level' THEN 'pms_skip_level'
        END
    );
$$;

-- ---------------------------------------------------------------------
-- has_safety_role(_user_id uuid, _role safety_app_role, _bu_id uuid)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.has_safety_role(
  _user_id          uuid,
  _role             public.safety_app_role,
  _business_unit_id uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    -- 1) Legacy safety_user_roles (preserves BU scope semantics)
    EXISTS (
      SELECT 1 FROM public.safety_user_roles
      WHERE user_id = _user_id
        AND role = _role
        AND (
          _business_unit_id IS NULL
          OR business_unit_id IS NULL
          OR business_unit_id = _business_unit_id
        )
    )
    OR
    -- 2) New IAC source — global or matching BU scope
    EXISTS (
      SELECT 1
      FROM public.iac_user_role_assignments ura
      JOIN public.iac_roles r ON r.id = ura.role_id
      WHERE ura.user_id = _user_id
        AND r.is_active = true
        AND (ura.expires_at IS NULL OR ura.expires_at > now())
        AND r.code = CASE _role::text
          WHEN 'admin'          THEN 'safety_admin'
          WHEN 'safety_head'    THEN 'safety_head'
          WHEN 'safety_officer' THEN 'safety_officer'
          WHEN 'bu_head'        THEN 'safety_bu_head'
          WHEN 'manager'        THEN 'safety_manager'
          WHEN 'supervisor'     THEN 'safety_supervisor'
          WHEN 'worker'         THEN 'safety_worker'
          WHEN 'auditor'        THEN 'safety_auditor'
        END
        AND (
          _business_unit_id IS NULL
          OR ura.scope_type = 'global'
          OR (ura.scope_type = 'business_unit' AND ura.scope_id = _business_unit_id)
        )
    );
$$;

-- ---------------------------------------------------------------------
-- has_any_safety_role(_user_id uuid)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.has_any_safety_role(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    EXISTS (SELECT 1 FROM public.safety_user_roles WHERE user_id = _user_id)
    OR
    EXISTS (
      SELECT 1
      FROM public.iac_user_role_assignments ura
      JOIN public.iac_roles r ON r.id = ura.role_id
      WHERE ura.user_id = _user_id
        AND r.is_active = true
        AND r.module = 'safety'
        AND (ura.expires_at IS NULL OR ura.expires_at > now())
    );
$$;

-- =====================================================================
-- IAC Phase 2.B — Leaver automation
-- =====================================================================
-- When a profile is deactivated (is_active flips false), revoke every
-- IAC assignment for that user and write an audit row attributed to
-- the system (NULL actor). Idempotent: only fires on the false transition.

CREATE OR REPLACE FUNCTION public.iac_revoke_on_deactivation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  removed_count int;
BEGIN
  IF NEW.is_active = false AND COALESCE(OLD.is_active, true) = true THEN
    WITH del AS (
      DELETE FROM public.iac_user_role_assignments
      WHERE user_id = NEW.id
      RETURNING id
    )
    SELECT count(*) INTO removed_count FROM del;

    IF removed_count > 0 THEN
      INSERT INTO public.iac_audit_log (actor_id, action, target_type, target_id, payload)
      VALUES (
        NULL,
        'assignment.auto_revoke_leaver',
        'profile',
        NEW.id::text,
        jsonb_build_object('removed', removed_count)
      );
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS iac_leaver_revoke ON public.profiles;
CREATE TRIGGER iac_leaver_revoke
  AFTER UPDATE OF is_active ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.iac_revoke_on_deactivation();

-- =====================================================================
-- IAC Phase 2.C — Expiry sweep RPC
-- =====================================================================
-- Idempotent function the cron (or a manual admin click) can invoke to
-- delete every assignment whose expires_at is in the past. Returns the
-- number removed. Writes a single audit row when anything was removed.

CREATE OR REPLACE FUNCTION public.iac_sweep_expired()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  removed_count int;
BEGIN
  WITH del AS (
    DELETE FROM public.iac_user_role_assignments
    WHERE expires_at IS NOT NULL AND expires_at < now()
    RETURNING id, user_id, role_id
  )
  SELECT count(*) INTO removed_count FROM del;

  IF removed_count > 0 THEN
    INSERT INTO public.iac_audit_log (actor_id, action, target_type, target_id, payload)
    VALUES (NULL, 'assignment.sweep_expired', 'system', NULL,
            jsonb_build_object('removed', removed_count));
  END IF;
  RETURN removed_count;
END $$;
