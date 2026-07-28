DROP FUNCTION IF EXISTS public.rpc_bulk_employee_attrs(uuid[]);

CREATE OR REPLACE FUNCTION public.rpc_bulk_employee_attrs(p_employee_ids uuid[])
 RETURNS TABLE(
   id uuid,
   designation text,
   pms_grade text,
   reporting_manager_id uuid,
   reporting_manager_name text,
   company_id uuid,
   department_id uuid,
   business_unit_id uuid,
   division_id uuid
 )
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    p.id,
    p.designation,
    p.pms_grade,
    p.reporting_manager_id,
    mgr.full_name AS reporting_manager_name,
    p.company_id,
    p.department_id,
    d.business_unit_id,
    bu.division_id
  FROM public.profiles p
  LEFT JOIN public.profiles mgr ON mgr.id = p.reporting_manager_id
  LEFT JOIN public.departments d ON d.id = p.department_id
  LEFT JOIN public.business_units bu ON bu.id = d.business_unit_id
  WHERE p.id = ANY(p_employee_ids);
$function$;

GRANT EXECUTE ON FUNCTION public.rpc_bulk_employee_attrs(uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_bulk_employee_attrs(uuid[]) TO service_role;