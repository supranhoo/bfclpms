-- ADR-062 fix: resolve_org_kpi_target_kpis declared r5..r0 as numeric but
-- the kpis table stores them as text. Postgres aborts the function with
-- "structure of query does not match function result type" before any
-- propagation can run. Recreate with text threshold columns matching the
-- live schema.

DROP FUNCTION IF EXISTS public.resolve_org_kpi_target_kpis(uuid, text, text, text, integer, text, uuid, uuid);

CREATE OR REPLACE FUNCTION public.resolve_org_kpi_target_kpis(
  p_category_id uuid,
  p_kra_name text,
  p_kpi_name text,
  p_review_period text,
  p_review_year integer,
  p_scope text DEFAULT 'organization',
  p_department_id uuid DEFAULT NULL,
  p_employee_id uuid DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  employee_id uuid,
  target_value numeric,
  weightage numeric,
  r5 text, r4 text, r3 text, r2 text, r1 text, r0 text,
  criteria text,
  uom text,
  uom_type text,
  qualitative_options jsonb,
  threshold_mode text,
  is_org_level boolean,
  org_level_scope text,
  full_name text,
  employee_code text,
  department_id uuid,
  department_name text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_kra_norm text := normalize_kpi_text(p_kra_name);
  v_kpi_norm text := normalize_kpi_text(p_kpi_name);
  v_authorized boolean := false;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF has_role(v_user, 'admin'::app_role) THEN
    v_authorized := true;
  ELSE
    SELECT EXISTS (
      SELECT 1 FROM org_kpi_data_owners o
      WHERE o.owner_id = v_user
        AND o.category_id = p_category_id
        AND normalize_kpi_text(o.kra_name) = v_kra_norm
        AND normalize_kpi_text(o.kpi_name) = v_kpi_norm
    ) INTO v_authorized;
  END IF;

  IF NOT v_authorized THEN
    RAISE EXCEPTION 'Not authorized to propagate this org KPI';
  END IF;

  -- Tier 1: exact normalized match on both kra and kpi
  RETURN QUERY
  SELECT k.id, k.employee_id, k.target_value, k.weightage,
         k.r5::text, k.r4::text, k.r3::text, k.r2::text, k.r1::text, k.r0::text,
         k.criteria, k.uom, k.uom_type::text, k.qualitative_options,
         k.threshold_mode::text, k.is_org_level, k.org_level_scope::text,
         p.full_name, p.employee_code, p.department_id, d.name AS department_name
  FROM kpis k
  LEFT JOIN profiles p ON p.id = k.employee_id
  LEFT JOIN departments d ON d.id = p.department_id
  WHERE k.is_org_level = true
    AND k.category_id = p_category_id
    AND k.review_period = p_review_period
    AND k.review_year = p_review_year
    AND normalize_kpi_text(k.kra_name) = v_kra_norm
    AND normalize_kpi_text(k.kpi_name) = v_kpi_norm
    AND (p_scope <> 'department' OR p_department_id IS NULL OR p.department_id = p_department_id)
    AND (p_scope <> 'employee' OR p_employee_id IS NULL OR k.employee_id = p_employee_id);

  IF FOUND THEN RETURN; END IF;

  -- Tier 2: normalized KRA match only (kpi name drift)
  RETURN QUERY
  SELECT k.id, k.employee_id, k.target_value, k.weightage,
         k.r5::text, k.r4::text, k.r3::text, k.r2::text, k.r1::text, k.r0::text,
         k.criteria, k.uom, k.uom_type::text, k.qualitative_options,
         k.threshold_mode::text, k.is_org_level, k.org_level_scope::text,
         p.full_name, p.employee_code, p.department_id, d.name AS department_name
  FROM kpis k
  LEFT JOIN profiles p ON p.id = k.employee_id
  LEFT JOIN departments d ON d.id = p.department_id
  WHERE k.is_org_level = true
    AND k.category_id = p_category_id
    AND k.review_period = p_review_period
    AND k.review_year = p_review_year
    AND normalize_kpi_text(k.kra_name) = v_kra_norm
    AND (p_scope <> 'department' OR p_department_id IS NULL OR p.department_id = p_department_id)
    AND (p_scope <> 'employee' OR p_employee_id IS NULL OR k.employee_id = p_employee_id);

  IF FOUND THEN RETURN; END IF;

  -- Tier 3: fuzzy substring on KRA
  RETURN QUERY
  SELECT k.id, k.employee_id, k.target_value, k.weightage,
         k.r5::text, k.r4::text, k.r3::text, k.r2::text, k.r1::text, k.r0::text,
         k.criteria, k.uom, k.uom_type::text, k.qualitative_options,
         k.threshold_mode::text, k.is_org_level, k.org_level_scope::text,
         p.full_name, p.employee_code, p.department_id, d.name AS department_name
  FROM kpis k
  LEFT JOIN profiles p ON p.id = k.employee_id
  LEFT JOIN departments d ON d.id = p.department_id
  WHERE k.is_org_level = true
    AND k.category_id = p_category_id
    AND k.review_period = p_review_period
    AND k.review_year = p_review_year
    AND normalize_kpi_text(k.kra_name) LIKE '%' || v_kra_norm || '%'
    AND (p_scope <> 'department' OR p_department_id IS NULL OR p.department_id = p_department_id)
    AND (p_scope <> 'employee' OR p_employee_id IS NULL OR k.employee_id = p_employee_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.resolve_org_kpi_target_kpis(uuid, text, text, text, integer, text, uuid, uuid) TO authenticated;