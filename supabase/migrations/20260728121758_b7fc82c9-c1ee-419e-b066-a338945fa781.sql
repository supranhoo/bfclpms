CREATE OR REPLACE FUNCTION public.get_reviewer_roster_slim()
 RETURNS TABLE(id uuid, full_name text, employee_code text, email text, designation text, pms_grade text, department_id uuid, reporting_manager_id uuid, avatar_url text, level text, is_active boolean, company_id uuid, functional_manager_id uuid)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
             p.avatar_url, p.level, p.is_active, p.company_id,
             p.functional_manager_id
      FROM public.profiles p
      ORDER BY p.full_name;
    RETURN;
  END IF;

  v_has_admin_users := public.has_profile_menu_access(v_uid, 'admin-users', 'view');

  IF v_has_admin_users THEN
    RETURN QUERY
      SELECT p.id, p.full_name, p.employee_code, p.email, p.designation,
             p.pms_grade, p.department_id, p.reporting_manager_id,
             p.avatar_url, p.level, p.is_active, p.company_id,
             p.functional_manager_id
      FROM public.profiles p
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
    -- ADR-193: functional reports are part of a reviewer's roster.
    functionals AS (
      SELECT p.id AS profile_id FROM public.profiles p
      WHERE p.is_active = true AND p.functional_manager_id = v_uid
    ),
    mine AS (
      SELECT v_uid AS profile_id
    )
    SELECT p.id, p.full_name, p.employee_code, p.email, p.designation,
           p.pms_grade, p.department_id, p.reporting_manager_id,
           p.avatar_url, p.level, p.is_active, p.company_id,
           p.functional_manager_id
    FROM public.profiles p
    WHERE p.id IN (SELECT d.profile_id FROM directs d)
       OR p.id IN (SELECT i.profile_id FROM indirects i)
       OR p.id IN (SELECT f.profile_id FROM functionals f)
       OR p.id IN (SELECT m.profile_id FROM mine m)
    ORDER BY p.full_name;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_reviewer_roster_slim() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_reviewer_roster_slim() TO service_role;