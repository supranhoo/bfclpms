DROP FUNCTION IF EXISTS public.get_profile_directory_entries_v2(uuid[]);

CREATE FUNCTION public.get_profile_directory_entries_v2(_ids uuid[])
RETURNS TABLE(
  id uuid,
  full_name text,
  employee_code text,
  designation text,
  department_id uuid,
  department_name text,
  pms_grade text,
  is_active boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT p.id, p.full_name, p.employee_code, p.designation,
         p.department_id, d.name AS department_name, p.pms_grade, p.is_active
  FROM public.profiles p
  LEFT JOIN public.departments d ON d.id = p.department_id
  WHERE auth.uid() IS NOT NULL
    AND p.id = ANY(_ids);
$$;

GRANT EXECUTE ON FUNCTION public.get_profile_directory_entries_v2(uuid[]) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_active_profile_directory_entries()
RETURNS TABLE(
  id uuid,
  full_name text,
  employee_code text,
  designation text,
  department_id uuid,
  department_name text,
  pms_grade text,
  is_active boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT p.id, p.full_name, p.employee_code, p.designation,
         p.department_id, d.name AS department_name, p.pms_grade, p.is_active
  FROM public.profiles p
  LEFT JOIN public.departments d ON d.id = p.department_id
  WHERE auth.uid() IS NOT NULL
    AND p.is_active = true;
$$;

GRANT EXECUTE ON FUNCTION public.get_active_profile_directory_entries() TO authenticated;