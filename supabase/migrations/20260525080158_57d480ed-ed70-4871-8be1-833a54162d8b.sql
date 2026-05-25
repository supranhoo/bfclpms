CREATE OR REPLACE FUNCTION public.rpc_kpi_org_flags(p_kpi_ids uuid[])
RETURNS TABLE (
  kpi_id uuid,
  is_org_level boolean,
  org_level_scope text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT k.id AS kpi_id,
         COALESCE(k.is_org_level, false) AS is_org_level,
         k.org_level_scope
  FROM public.kpis k
  WHERE k.id = ANY(COALESCE(p_kpi_ids, ARRAY[]::uuid[]));
$$;

REVOKE ALL ON FUNCTION public.rpc_kpi_org_flags(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_kpi_org_flags(uuid[]) TO authenticated;