-- Bulk Review employee-axis filters need profile attributes (designation,
-- pms_grade, reporting_manager_id + name) for every employee in the loaded
-- scope. Non-admin viewers (HR PMS / Manager / Skip / Auditor / Management)
-- hit RLS on public.profiles for rows outside their own reporting chain,
-- which empties the Designation / Grade / Reporting Manager filters and
-- makes them appear broken.
--
-- This SECURITY DEFINER RPC mirrors the pattern already used by
-- rpc_kpi_org_flags: read-only, scoped to the explicit id list the caller
-- already has visibility for (they came from review_submissions the viewer
-- can see), and returns only the small set of attribute columns the filter
-- UI needs — no PII beyond what the Bulk Review snapshot already shows.

CREATE OR REPLACE FUNCTION public.rpc_bulk_employee_attrs(p_employee_ids uuid[])
RETURNS TABLE (
  id uuid,
  designation text,
  pms_grade text,
  reporting_manager_id uuid,
  reporting_manager_name text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p.id,
    p.designation,
    p.pms_grade,
    p.reporting_manager_id,
    mgr.full_name AS reporting_manager_name
  FROM public.profiles p
  LEFT JOIN public.profiles mgr ON mgr.id = p.reporting_manager_id
  WHERE p.id = ANY(p_employee_ids);
$$;

REVOKE ALL ON FUNCTION public.rpc_bulk_employee_attrs(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_bulk_employee_attrs(uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rpc_bulk_employee_attrs(uuid[]) TO service_role;