DROP FUNCTION IF EXISTS public.get_incentive_program_employees(uuid);

CREATE OR REPLACE FUNCTION public.get_incentive_program_employees(_program_id uuid)
RETURNS TABLE (
  id uuid,
  full_name text,
  employee_code text,
  designation text,
  department_id uuid,
  department_name text,
  business_unit_id uuid,
  division_id uuid,
  company_id uuid
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH m AS (
    SELECT mapping_type, mapping_value
    FROM public.incentive_program_mappings
    WHERE program_id = _program_id
  )
  SELECT DISTINCT
    p.id,
    p.full_name,
    p.employee_code,
    p.designation,
    p.department_id,
    d.name AS department_name,
    d.business_unit_id,
    bu.division_id,
    COALESCE(p.company_id, div.company_id) AS company_id
  FROM public.profiles p
  LEFT JOIN public.departments d     ON d.id  = p.department_id
  LEFT JOIN public.business_units bu ON bu.id = d.business_unit_id
  LEFT JOIN public.divisions div     ON div.id = bu.division_id
  WHERE p.is_active = true
    AND auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM m
      WHERE (m.mapping_type = 'employee'      AND m.mapping_value::uuid = p.id)
         OR (m.mapping_type = 'department'    AND m.mapping_value::uuid = p.department_id)
         OR (m.mapping_type = 'business_unit' AND m.mapping_value::uuid = d.business_unit_id)
         OR (m.mapping_type = 'division'      AND m.mapping_value::uuid = bu.division_id)
         OR (m.mapping_type = 'designation'   AND m.mapping_value = p.designation)
    );
$$;

REVOKE ALL ON FUNCTION public.get_incentive_program_employees(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_incentive_program_employees(uuid) TO authenticated, service_role;