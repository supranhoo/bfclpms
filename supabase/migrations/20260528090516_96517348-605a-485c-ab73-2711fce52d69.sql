
-- =========================================================================
-- Step 3a: Single-source-of-truth resolver for Org KPI scope population.
-- Additive only. No existing function is modified.
-- =========================================================================

-- resolve_scope_population
-- Returns the active employee ids that fall inside a given scope target.
-- p_review_period / p_review_year accepted for future period-aware logic;
-- currently unused (Phase 1: population is time-invariant).
CREATE OR REPLACE FUNCTION public.resolve_scope_population(
  p_scope             text,
  p_division_id       uuid DEFAULT NULL,
  p_business_unit_id  uuid DEFAULT NULL,
  p_department_id     uuid DEFAULT NULL,
  p_location_id       uuid DEFAULT NULL,
  p_pms_grade_id      uuid DEFAULT NULL,
  p_level_id          uuid DEFAULT NULL,
  p_employee_id       uuid DEFAULT NULL,
  p_review_period     text DEFAULT NULL,
  p_review_year       int  DEFAULT NULL
)
RETURNS SETOF uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_scope IS NULL THEN RETURN; END IF;

  IF p_scope = 'organization' THEN
    RETURN QUERY
      SELECT p.id FROM public.profiles p WHERE p.is_active = true;

  ELSIF p_scope = 'division' THEN
    IF p_division_id IS NULL THEN RETURN; END IF;
    RETURN QUERY
      SELECT p.id
      FROM public.profiles p
      JOIN public.departments    d  ON d.id = p.department_id
      JOIN public.business_units bu ON bu.id = d.business_unit_id
      WHERE p.is_active = true
        AND bu.division_id = p_division_id;

  ELSIF p_scope = 'business_unit' THEN
    IF p_business_unit_id IS NULL THEN RETURN; END IF;
    RETURN QUERY
      SELECT p.id
      FROM public.profiles p
      JOIN public.departments d ON d.id = p.department_id
      WHERE p.is_active = true
        AND d.business_unit_id = p_business_unit_id;

  ELSIF p_scope = 'department' THEN
    IF p_department_id IS NULL THEN RETURN; END IF;
    RETURN QUERY
      SELECT p.id FROM public.profiles p
      WHERE p.is_active = true AND p.department_id = p_department_id;

  ELSIF p_scope = 'location' THEN
    IF p_location_id IS NULL THEN RETURN; END IF;
    RETURN QUERY
      SELECT p.id FROM public.profiles p
      WHERE p.is_active = true AND p.location_id = p_location_id;

  ELSIF p_scope = 'pms_grade' THEN
    IF p_pms_grade_id IS NULL THEN RETURN; END IF;
    RETURN QUERY
      SELECT p.id FROM public.profiles p
      WHERE p.is_active = true AND p.pms_grade_id = p_pms_grade_id;

  ELSIF p_scope = 'level' THEN
    IF p_level_id IS NULL THEN RETURN; END IF;
    RETURN QUERY
      SELECT p.id FROM public.profiles p
      WHERE p.is_active = true AND p.level_id = p_level_id;

  ELSIF p_scope = 'employee' THEN
    IF p_employee_id IS NULL THEN RETURN; END IF;
    RETURN QUERY
      SELECT p.id FROM public.profiles p
      WHERE p.is_active = true AND p.id = p_employee_id;

  ELSE
    RETURN; -- unknown scope: empty set (forward-compat)
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_scope_population(text,uuid,uuid,uuid,uuid,uuid,uuid,uuid,text,int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_scope_population(text,uuid,uuid,uuid,uuid,uuid,uuid,uuid,text,int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_scope_population(text,uuid,uuid,uuid,uuid,uuid,uuid,uuid,text,int) TO service_role;

COMMENT ON FUNCTION public.resolve_scope_population(text,uuid,uuid,uuid,uuid,uuid,uuid,uuid,text,int)
IS 'Single source of truth for Org KPI scope population. Returns active employee ids inside the given scope target. Used by propagation, scope-change cascading, audit-ownership and reporting (Phase 1, 2026-05).';

-- =========================================================================
-- has_scope_membership: fast boolean check for RLS short-circuit.
-- Returns true iff the user belongs to the given scope target.
-- Designed for early-exit by the RLS policy chain in Step 4.
-- =========================================================================
CREATE OR REPLACE FUNCTION public.has_scope_membership(
  p_user_id           uuid,
  p_scope             text,
  p_division_id       uuid DEFAULT NULL,
  p_business_unit_id  uuid DEFAULT NULL,
  p_department_id     uuid DEFAULT NULL,
  p_location_id       uuid DEFAULT NULL,
  p_pms_grade_id      uuid DEFAULT NULL,
  p_level_id          uuid DEFAULT NULL,
  p_employee_id       uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_dep uuid;
  v_bu  uuid;
BEGIN
  IF p_user_id IS NULL OR p_scope IS NULL THEN RETURN false; END IF;

  IF p_scope = 'organization' THEN RETURN true; END IF;

  IF p_scope = 'employee' THEN
    RETURN p_employee_id IS NOT NULL AND p_user_id = p_employee_id;
  END IF;

  IF p_scope = 'department' THEN
    RETURN EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = p_user_id AND is_active = true AND department_id = p_department_id
    );
  END IF;

  IF p_scope = 'location' THEN
    RETURN EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = p_user_id AND is_active = true AND location_id = p_location_id
    );
  END IF;

  IF p_scope = 'pms_grade' THEN
    RETURN EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = p_user_id AND is_active = true AND pms_grade_id = p_pms_grade_id
    );
  END IF;

  IF p_scope = 'level' THEN
    RETURN EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = p_user_id AND is_active = true AND level_id = p_level_id
    );
  END IF;

  IF p_scope = 'business_unit' THEN
    SELECT department_id INTO v_dep FROM public.profiles WHERE id = p_user_id AND is_active = true;
    IF v_dep IS NULL THEN RETURN false; END IF;
    RETURN EXISTS (
      SELECT 1 FROM public.departments WHERE id = v_dep AND business_unit_id = p_business_unit_id
    );
  END IF;

  IF p_scope = 'division' THEN
    SELECT department_id INTO v_dep FROM public.profiles WHERE id = p_user_id AND is_active = true;
    IF v_dep IS NULL THEN RETURN false; END IF;
    SELECT business_unit_id INTO v_bu FROM public.departments WHERE id = v_dep;
    IF v_bu IS NULL THEN RETURN false; END IF;
    RETURN EXISTS (
      SELECT 1 FROM public.business_units WHERE id = v_bu AND division_id = p_division_id
    );
  END IF;

  RETURN false; -- unknown scope
END;
$$;

REVOKE ALL ON FUNCTION public.has_scope_membership(uuid,text,uuid,uuid,uuid,uuid,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_scope_membership(uuid,text,uuid,uuid,uuid,uuid,uuid,uuid,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_scope_membership(uuid,text,uuid,uuid,uuid,uuid,uuid,uuid,uuid) TO service_role;

COMMENT ON FUNCTION public.has_scope_membership(uuid,text,uuid,uuid,uuid,uuid,uuid,uuid,uuid)
IS 'Fast boolean: does this user belong to the given scope target? Used by RLS short-circuit on kpis.';
