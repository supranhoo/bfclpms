DROP FUNCTION IF EXISTS public.get_reviewer_roster_slim();

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

  -- Scoped fallback: self + reporting subtree + functional reports.
  RETURN QUERY
    SELECT p.id, p.full_name, p.employee_code, p.email, p.designation,
           p.pms_grade, p.department_id, p.reporting_manager_id,
           p.avatar_url, p.level, p.is_active, p.company_id,
           p.functional_manager_id
    FROM public.profiles p
    WHERE p.id = v_uid
       OR p.reporting_manager_id = v_uid
       OR p.functional_manager_id = v_uid
       OR p.id IN (SELECT unnest(public.get_subordinate_ids(v_uid)))
    ORDER BY p.full_name;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_reviewer_roster_slim() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_reviewer_roster_slim() TO service_role;