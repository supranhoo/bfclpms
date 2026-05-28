-- Consolidate 9 OR'd SELECT policies on public.kpis into one function-backed policy.
-- Short-circuits on global roles before any per-row joins.

CREATE OR REPLACE FUNCTION public.can_view_kpi_row(
  _kpi_id uuid,
  _employee_id uuid,
  _is_org_level boolean,
  _category_id uuid,
  _kra_name text,
  _kpi_name text
)
RETURNS boolean
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

  -- Fast path: own KPI
  IF _employee_id = _uid THEN
    RETURN true;
  END IF;

  -- Fast path: global roles (single user_roles+iac lookup each, cached per session by planner)
  IF public.has_role(_uid, 'admin'::public.app_role)
     OR public.has_role(_uid, 'auditor'::public.app_role)
     OR public.has_role(_uid, 'hr_pms'::public.app_role)
     OR public.has_role(_uid, 'management'::public.app_role)
     OR public.has_report_access_override(_uid)
  THEN
    RETURN true;
  END IF;

  -- Manager of the employee
  IF public.has_role(_uid, 'manager'::public.app_role)
     AND EXISTS (
       SELECT 1 FROM public.profiles
       WHERE id = _employee_id AND reporting_manager_id = _uid
     )
  THEN
    RETURN true;
  END IF;

  -- Skip-level manager
  IF EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = _employee_id
      AND public.get_skip_level_manager(p.id) = _uid
  ) THEN
    RETURN true;
  END IF;

  -- Mentioned on the KPI
  IF EXISTS (
    SELECT 1 FROM public.kpi_mention_access
    WHERE kpi_id = _kpi_id AND user_id = _uid
  ) THEN
    RETURN true;
  END IF;

  -- Org-level data owner
  IF _is_org_level = true AND EXISTS (
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

GRANT EXECUTE ON FUNCTION public.can_view_kpi_row(uuid, uuid, boolean, uuid, text, text) TO authenticated, service_role;

-- Drop the 9 individual SELECT policies
DROP POLICY IF EXISTS "Admins and auditors can view all KPIs" ON public.kpis;
DROP POLICY IF EXISTS "Data owners can view assigned org-level KPIs" ON public.kpis;
DROP POLICY IF EXISTS "Employees can view their own KPIs" ON public.kpis;
DROP POLICY IF EXISTS "HR PMS can view all KPIs" ON public.kpis;
DROP POLICY IF EXISTS "Management can view all KPIs" ON public.kpis;
DROP POLICY IF EXISTS "Managers can view their reports' KPIs" ON public.kpis;
DROP POLICY IF EXISTS "Mentioned users can view KPI" ON public.kpis;
DROP POLICY IF EXISTS "Report override users can view all KPIs" ON public.kpis;
DROP POLICY IF EXISTS "Skip-level managers can view reports KPIs" ON public.kpis;

-- Single consolidated SELECT policy
CREATE POLICY "Consolidated KPI view access"
ON public.kpis FOR SELECT
TO authenticated
USING (public.can_view_kpi_row(id, employee_id, is_org_level, category_id, kra_name, kpi_name));
