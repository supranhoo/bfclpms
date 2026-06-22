
-- Drop the three broad SELECT policies that exposed full profile PII
DROP POLICY IF EXISTS "Authenticated users can view org kpi data owner profiles" ON public.profiles;
DROP POLICY IF EXISTS "Authenticated users can view org kpi value enterer profiles" ON public.profiles;
DROP POLICY IF EXISTS "Incentive data entry users can view active profiles" ON public.profiles;

-- Safe directory lookup: returns only non-sensitive identifiers.
-- Use this from screens that need to display a name/code for an org KPI data owner,
-- value enterer, or incentive-eligible employee without leaking PII.
CREATE OR REPLACE FUNCTION public.get_profile_directory_entries(_ids uuid[])
RETURNS TABLE (
  id uuid,
  full_name text,
  employee_code text,
  is_active boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.full_name, p.employee_code, p.is_active
  FROM public.profiles p
  WHERE auth.uid() IS NOT NULL
    AND p.id = ANY(_ids);
$$;

REVOKE ALL ON FUNCTION public.get_profile_directory_entries(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_profile_directory_entries(uuid[]) TO authenticated, service_role;
