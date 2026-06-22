-- v2.66.38 — Manager Team Reviews roster RPC
-- Returns direct + skip-level active reports for a viewer, with department fields.
-- SECURITY DEFINER avoids per-row RLS cost on profiles and prevents the
-- client-side join failure that left Sajid Raza's Team Reviews dashboard blank.

CREATE OR REPLACE FUNCTION public.get_manager_team_roster(_viewer_id uuid)
RETURNS TABLE (
  id uuid,
  full_name text,
  email text,
  designation text,
  employee_code text,
  avatar_url text,
  department_id uuid,
  reporting_manager_id uuid,
  pms_grade text,
  mobile_number text,
  is_active boolean,
  relationship text,
  department_name text,
  department_code text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH direct_reports AS (
    SELECT p.*
    FROM public.profiles p
    WHERE p.reporting_manager_id = _viewer_id
      AND p.id <> _viewer_id
      AND p.is_active = true
  ),
  skip_reports AS (
    SELECT p.*
    FROM public.profiles p
    WHERE p.reporting_manager_id IN (SELECT id FROM direct_reports)
      AND p.id <> _viewer_id
      AND p.is_active = true
      AND p.id NOT IN (SELECT id FROM direct_reports)
  ),
  combined AS (
    SELECT 'direct'::text AS relationship, * FROM direct_reports
    UNION ALL
    SELECT 'indirect'::text AS relationship, * FROM skip_reports
  )
  SELECT
    c.id,
    c.full_name,
    c.email,
    c.designation,
    c.employee_code,
    c.avatar_url,
    c.department_id,
    c.reporting_manager_id,
    c.pms_grade,
    c.mobile_number,
    c.is_active,
    c.relationship,
    d.name AS department_name,
    d.code AS department_code
  FROM combined c
  LEFT JOIN public.departments d ON d.id = c.department_id
  ORDER BY c.full_name;
$$;

REVOKE ALL ON FUNCTION public.get_manager_team_roster(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_manager_team_roster(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_manager_team_roster(uuid) TO service_role;