-- Wave 2 perf: replace client-side paged scans + JS Set dedupe with a
-- single SECURITY DEFINER round-trip. Backed by the
-- idx_profiles_active_designation index added in Wave 1.

CREATE OR REPLACE FUNCTION public.get_distinct_active_designations()
RETURNS TABLE(designation text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT p.designation
  FROM public.profiles p
  WHERE p.is_active = true
    AND p.designation IS NOT NULL
    AND p.designation <> ''
  ORDER BY 1
$$;

CREATE OR REPLACE FUNCTION public.get_distinct_active_pms_grades()
RETURNS TABLE(pms_grade text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT p.pms_grade
  FROM public.profiles p
  WHERE p.is_active = true
    AND p.pms_grade IS NOT NULL
    AND p.pms_grade <> ''
  ORDER BY 1
$$;

REVOKE ALL ON FUNCTION public.get_distinct_active_designations() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_distinct_active_pms_grades() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_distinct_active_designations() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_distinct_active_pms_grades() TO authenticated;