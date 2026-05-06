CREATE OR REPLACE FUNCTION public.normalize_kpi_text(p text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT lower(btrim(regexp_replace(coalesce(p, ''), '\s+', ' ', 'g')))
$$;

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
     AND public.normalize_kpi_text(o.kra_name) = public.normalize_kpi_text(k.kra_name)
     AND public.normalize_kpi_text(o.kpi_name) = public.normalize_kpi_text(k.kpi_name)
    WHERE k.employee_id  = p_profile_id
      AND k.is_org_level = true
      AND o.owner_id     = auth.uid()
  );
$$;