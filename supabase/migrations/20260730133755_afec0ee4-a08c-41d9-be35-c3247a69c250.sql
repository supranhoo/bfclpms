CREATE OR REPLACE FUNCTION public.can_view_org_kpi_value(
  _employee_id uuid,
  _category_id uuid,
  _kra_name text,
  _kpi_name text
) RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
BEGIN
  IF _uid IS NULL THEN
    RETURN false;
  END IF;

  -- Org-wide rows carry no personal performance data.
  IF _employee_id IS NULL THEN
    RETURN true;
  END IF;

  IF _employee_id = _uid THEN
    RETURN true;
  END IF;

  IF public.has_role(_uid, 'admin'::public.app_role)
     OR public.has_role(_uid, 'auditor'::public.app_role)
     OR public.has_role(_uid, 'hr_pms'::public.app_role)
     OR public.has_role(_uid, 'management'::public.app_role)
     OR public.has_report_access_override(_uid)
  THEN
    RETURN true;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = _employee_id
      AND (p.reporting_manager_id = _uid
           OR p.functional_manager_id = _uid
           OR public.get_skip_level_manager(p.id) = _uid)
  ) THEN
    RETURN true;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.org_kpi_data_owners o
    WHERE o.owner_id = _uid
      AND o.category_id = _category_id
      AND public.normalize_kpi_text(o.kra_name) = public.normalize_kpi_text(_kra_name)
      AND public.normalize_kpi_text(o.kpi_name) = public.normalize_kpi_text(_kpi_name)
  ) THEN
    RETURN true;
  END IF;

  RETURN false;
END;
$$;

GRANT EXECUTE ON FUNCTION public.can_view_org_kpi_value(uuid, uuid, text, text) TO authenticated;

DROP POLICY IF EXISTS "Authenticated users can view org_kpi_values" ON public.org_kpi_values;

CREATE POLICY "Scoped read of org_kpi_values"
ON public.org_kpi_values
FOR SELECT
TO authenticated
USING (public.can_view_org_kpi_value(employee_id, category_id, kra_name, kpi_name));