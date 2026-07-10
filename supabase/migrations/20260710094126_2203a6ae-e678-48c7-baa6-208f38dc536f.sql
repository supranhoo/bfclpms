CREATE OR REPLACE FUNCTION public.can_view_profile_for_annual_review_directory(p_profile_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_access jsonb;
  v_scope text;
  v_bu uuid;
  v_prof_bu uuid;
BEGIN
  IF auth.uid() IS NULL OR p_profile_id IS NULL THEN
    RETURN false;
  END IF;

  v_access := public.annual_review_directory_access(auth.uid());
  IF NOT COALESCE((v_access->>'can_access')::boolean, false) THEN
    RETURN false;
  END IF;

  v_scope := v_access->>'scope';
  IF v_scope = 'all' THEN
    RETURN true;
  END IF;

  IF v_scope = 'bu' THEN
    v_bu := NULLIF(v_access->>'business_unit_id','')::uuid;
    IF v_bu IS NULL THEN RETURN false; END IF;
    SELECT d.business_unit_id INTO v_prof_bu
      FROM public.profiles p
      LEFT JOIN public.departments d ON d.id = p.department_id
     WHERE p.id = p_profile_id;
    RETURN v_prof_bu IS NOT NULL AND v_prof_bu = v_bu;
  END IF;

  RETURN false;
END;
$$;

REVOKE ALL ON FUNCTION public.can_view_profile_for_annual_review_directory(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_view_profile_for_annual_review_directory(uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS "Annual review directory reviewers can view scoped profiles" ON public.profiles;
CREATE POLICY "Annual review directory reviewers can view scoped profiles"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (public.can_view_profile_for_annual_review_directory(id));