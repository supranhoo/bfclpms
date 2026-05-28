
CREATE OR REPLACE FUNCTION public.get_user_org_scope_filters(p_user_id uuid)
RETURNS TABLE (
  profile_id uuid,
  company_id uuid,
  division_id uuid,
  business_unit_id uuid,
  department_id uuid,
  location text,
  designation text,
  pms_grade text,
  level text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    s.profile_id, s.company_id, s.division_id, s.business_unit_id,
    s.department_id, s.location, s.designation, s.pms_grade, s.level
  FROM public.access_profile_assignments apa
  JOIN public.access_profiles ap
    ON ap.id = apa.profile_id AND ap.is_active = true
  JOIN public.access_profile_org_scope s
    ON s.profile_id = ap.id
  WHERE apa.user_id = p_user_id;
$$;

GRANT EXECUTE ON FUNCTION public.get_user_org_scope_filters(uuid) TO authenticated;

-- Set of employee IDs visible to a viewer based on their access-profile org scope.
-- Admin shortcut: return the full active roster.
-- Otherwise: any active employee that satisfies AT LEAST ONE of the viewer's
-- scope rows where every populated scope field matches the employee. Division
-- and business unit are derived from departments; location text matches the
-- employee's location_id name.
CREATE OR REPLACE FUNCTION public.get_visible_employee_ids(p_user_id uuid)
RETURNS TABLE (employee_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id AS employee_id
  FROM public.profiles p
  WHERE p.is_active = true
    AND public.has_role(p_user_id, 'admin'::public.app_role)

  UNION

  SELECT DISTINCT p.id AS employee_id
  FROM public.profiles p
  LEFT JOIN public.departments d        ON d.id = p.department_id
  LEFT JOIN public.business_units bu    ON bu.id = d.business_unit_id
  LEFT JOIN public.locations loc        ON loc.id = p.location_id
  JOIN public.access_profile_assignments apa
    ON apa.user_id = p_user_id
  JOIN public.access_profiles ap
    ON ap.id = apa.profile_id AND ap.is_active = true
  JOIN public.access_profile_org_scope s
    ON s.profile_id = ap.id
  WHERE p.is_active = true
    AND (s.company_id       IS NULL OR s.company_id       = p.company_id)
    AND (s.department_id    IS NULL OR s.department_id    = p.department_id)
    AND (s.business_unit_id IS NULL OR s.business_unit_id = d.business_unit_id)
    AND (s.division_id      IS NULL OR s.division_id      = bu.division_id)
    AND (s.location         IS NULL OR s.location         = loc.name)
    AND (s.designation      IS NULL OR s.designation      = p.designation)
    AND (s.pms_grade        IS NULL OR s.pms_grade        = p.pms_grade)
    AND (s.level            IS NULL OR s.level            = p.level);
$$;

GRANT EXECUTE ON FUNCTION public.get_visible_employee_ids(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.user_can_see_employee(p_user_id uuid, p_employee_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.get_visible_employee_ids(p_user_id) v
    WHERE v.employee_id = p_employee_id
  );
$$;

GRANT EXECUTE ON FUNCTION public.user_can_see_employee(uuid, uuid) TO authenticated;
