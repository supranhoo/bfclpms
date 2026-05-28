-- User Management visibility: include inactive employees within scoped access
-- so Total/Active/Inactive counters and the Inactive filter work for
-- access-profile viewers (e.g. Avinash 101732).

-- 1) New helper that mirrors get_visible_employee_ids but does NOT filter
-- out inactive employees. Reserved for User Management surfaces only.
CREATE OR REPLACE FUNCTION public.get_user_management_visible_employee_ids(p_user_id uuid)
RETURNS TABLE(employee_id uuid)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  -- Admins see every profile (active + inactive)
  SELECT p.id AS employee_id
  FROM public.profiles p
  WHERE public.has_role(p_user_id, 'admin'::public.app_role)

  UNION

  -- Access-profile scoped viewers see all employees (active + inactive)
  -- that match at least one Org Level Scope row
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
  WHERE (s.company_id       IS NULL OR s.company_id       = p.company_id)
    AND (s.department_id    IS NULL OR s.department_id    = p.department_id)
    AND (s.business_unit_id IS NULL OR s.business_unit_id = d.business_unit_id)
    AND (s.division_id      IS NULL OR s.division_id      = bu.division_id)
    AND (s.location         IS NULL OR s.location         = loc.name)
    AND (s.designation      IS NULL OR s.designation      = p.designation)
    AND (s.pms_grade        IS NULL OR s.pms_grade        = p.pms_grade)
    AND (s.level            IS NULL OR s.level            = p.level);
$$;

GRANT EXECUTE ON FUNCTION public.get_user_management_visible_employee_ids(uuid) TO authenticated;

-- 2) Companion boolean helper for use in RLS
CREATE OR REPLACE FUNCTION public.user_mgmt_can_see_employee(p_user_id uuid, p_employee_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.get_user_management_visible_employee_ids(p_user_id) v
    WHERE v.employee_id = p_employee_id
  );
$$;

GRANT EXECUTE ON FUNCTION public.user_mgmt_can_see_employee(uuid, uuid) TO authenticated;

-- 3) Update the scoped profiles SELECT policy to use the User Management
-- helper so head-count queries on profiles can see inactive employees in scope.
DROP POLICY IF EXISTS "Profile-granted users can view scoped profiles" ON public.profiles;
CREATE POLICY "Profile-granted users can view scoped profiles"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  public.has_profile_menu_access(auth.uid(), 'admin-users', 'view')
  AND public.user_mgmt_can_see_employee(auth.uid(), id)
);

-- 4) Update get_reviewer_roster_slim so the admin-users access-profile branch
-- returns BOTH active and inactive employees in scope (User Management owns
-- activate/deactivate). Full-role and manager/employee branches unchanged.
CREATE OR REPLACE FUNCTION public.get_reviewer_roster_slim()
RETURNS TABLE(id uuid, full_name text, employee_code text, email text, designation text, pms_grade text, department_id uuid, reporting_manager_id uuid, avatar_url text, level text, is_active boolean, company_id uuid)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_is_full boolean;
  v_has_admin_users boolean;
BEGIN
  PERFORM set_config('statement_timeout', '30000', true);

  IF v_uid IS NULL THEN
    RETURN;
  END IF;

  v_is_full := has_role(v_uid, 'admin'::app_role)
    OR has_role(v_uid, 'auditor'::app_role)
    OR has_role(v_uid, 'hr_pms'::app_role)
    OR has_role(v_uid, 'management'::app_role)
    OR has_report_access_override(v_uid);

  IF v_is_full THEN
    RETURN QUERY
      SELECT p.id, p.full_name, p.employee_code, p.email, p.designation,
             p.pms_grade, p.department_id, p.reporting_manager_id,
             p.avatar_url, p.level, p.is_active, p.company_id
      FROM public.profiles p
      WHERE p.is_active = true
      ORDER BY p.full_name;
    RETURN;
  END IF;

  v_has_admin_users := public.has_profile_menu_access(v_uid, 'admin-users', 'view');

  IF v_has_admin_users THEN
    -- User Management branch: include inactive employees in scope so the
    -- Inactive filter and counters reflect actual data.
    RETURN QUERY
      SELECT p.id, p.full_name, p.employee_code, p.email, p.designation,
             p.pms_grade, p.department_id, p.reporting_manager_id,
             p.avatar_url, p.level, p.is_active, p.company_id
      FROM public.profiles p
      JOIN public.get_user_management_visible_employee_ids(v_uid) v ON v.employee_id = p.id
      ORDER BY p.full_name;
    RETURN;
  END IF;

  RETURN QUERY
    WITH directs AS (
      SELECT p.id AS profile_id FROM public.profiles p
      WHERE p.is_active = true AND p.reporting_manager_id = v_uid
    ),
    indirects AS (
      SELECT p.id AS profile_id FROM public.profiles p
      WHERE p.is_active = true
        AND p.reporting_manager_id IN (SELECT d.profile_id FROM directs d)
    ),
    mine AS (
      SELECT v_uid AS profile_id
    )
    SELECT p.id, p.full_name, p.employee_code, p.email, p.designation,
           p.pms_grade, p.department_id, p.reporting_manager_id,
           p.avatar_url, p.level, p.is_active, p.company_id
    FROM public.profiles p
    WHERE p.id IN (SELECT d.profile_id FROM directs d)
       OR p.id IN (SELECT i.profile_id FROM indirects i)
       OR p.id IN (SELECT m.profile_id FROM mine m)
    ORDER BY p.full_name;
END;
$$;