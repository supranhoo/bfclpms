CREATE OR REPLACE FUNCTION public.is_org_kpi_data_owner_for_profile(p_profile_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.kpis k
    JOIN public.org_kpi_data_owners o
      ON o.category_id = k.category_id
     AND o.kra_name    = k.kra_name
     AND o.kpi_name    = k.kpi_name
    WHERE k.employee_id = p_profile_id
      AND k.is_org_level = true
      AND o.owner_id    = auth.uid()
  );
$$;

DROP POLICY IF EXISTS "Org KPI data owners can view their mapped employee profiles" ON public.profiles;

CREATE POLICY "Org KPI data owners can view their mapped employee profiles"
ON public.profiles
FOR SELECT
TO authenticated
USING (public.is_org_kpi_data_owner_for_profile(id));