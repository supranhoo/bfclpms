DROP FUNCTION IF EXISTS public.get_profile_directory_entries_v2(uuid[]);

CREATE FUNCTION public.get_profile_directory_entries_v2(_ids uuid[])
RETURNS TABLE(
  id uuid,
  full_name text,
  employee_code text,
  designation text,
  department_id uuid,
  department_name text,
  business_unit_id uuid,
  business_unit_name text,
  division_id uuid,
  division_name text,
  company_id uuid,
  company_name text,
  pms_grade text,
  is_active boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    p.id,
    p.full_name,
    p.employee_code,
    p.designation,
    p.department_id,
    d.name AS department_name,
    d.business_unit_id,
    bu.name AS business_unit_name,
    bu.division_id,
    dv.name AS division_name,
    COALESCE(p.company_id, dv.company_id) AS company_id,
    c.name AS company_name,
    p.pms_grade,
    p.is_active
  FROM public.profiles p
  LEFT JOIN public.departments d ON d.id = p.department_id
  LEFT JOIN public.business_units bu ON bu.id = d.business_unit_id
  LEFT JOIN public.divisions dv ON dv.id = bu.division_id
  LEFT JOIN public.companies c ON c.id = COALESCE(p.company_id, dv.company_id)
  WHERE auth.uid() IS NOT NULL
    AND p.id = ANY(_ids);
$$;

REVOKE ALL ON FUNCTION public.get_profile_directory_entries_v2(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_profile_directory_entries_v2(uuid[]) TO authenticated, service_role;