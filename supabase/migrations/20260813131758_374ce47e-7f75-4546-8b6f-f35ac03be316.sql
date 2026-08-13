-- ADR-256: evidence read parity with KPI row visibility.
-- POLICY §EVIDENCE-READ-KPI-PARTICIPATION (updated): the set of users allowed
-- to OPEN a KPI's evidence file must equal the set allowed to SEE the KPI row
-- (public.can_view_kpi_row). Previously can_read_kpi_evidence covered only
-- owner / direct manager / manager-of-manager / assigned auditor / mention,
-- so Management, HR PMS, the resolved skip-level manager, the functional
-- manager, org-KPI data owners and report-access overrides were denied at
-- Storage even though the attachment chip was visible to them.
CREATE OR REPLACE FUNCTION public.can_read_kpi_evidence(p_kpi_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := (SELECT auth.uid());
  _employee_id uuid;
BEGIN
  IF _uid IS NULL OR p_kpi_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT k.employee_id INTO _employee_id FROM public.kpis k WHERE k.id = p_kpi_id;
  IF _employee_id IS NULL THEN
    -- KPI row missing (or unassigned): fall back to mention access only.
    RETURN EXISTS (
      SELECT 1 FROM public.kpi_mention_access m
      WHERE m.kpi_id = p_kpi_id AND m.user_id = _uid
    );
  END IF;

  -- Own KPI
  IF _employee_id = _uid THEN
    RETURN true;
  END IF;

  -- Global roles that can view every KPI row
  IF public.has_role(_uid, 'admin'::public.app_role)
     OR public.has_role(_uid, 'auditor'::public.app_role)
     OR public.has_role(_uid, 'hr_pms'::public.app_role)
     OR public.has_role(_uid, 'management'::public.app_role)
     OR public.has_report_access_override(_uid)
  THEN
    RETURN true;
  END IF;

  -- Reporting manager, functional manager, or manager-of-manager
  IF EXISTS (
    SELECT 1
    FROM public.profiles emp
    LEFT JOIN public.profiles mgr ON mgr.id = emp.reporting_manager_id
    WHERE emp.id = _employee_id
      AND (
        emp.reporting_manager_id = _uid
        OR emp.functional_manager_id = _uid
        OR mgr.reporting_manager_id = _uid
      )
  ) THEN
    RETURN true;
  END IF;

  -- Resolved skip-level manager (workflow-aware, not just manager-of-manager)
  IF public.get_skip_level_manager(_employee_id) = _uid THEN
    RETURN true;
  END IF;

  -- Assigned auditor (employee-level or KPI-level)
  IF EXISTS (
    SELECT 1 FROM public.audit_kpi_assignments a
    WHERE a.employee_id = _employee_id AND a.auditor_id = _uid
  ) OR EXISTS (
    SELECT 1 FROM public.audit_kpi_level_assignments la
    WHERE la.kpi_id = p_kpi_id AND la.auditor_id = _uid
  ) THEN
    RETURN true;
  END IF;

  -- Mentioned on the KPI
  IF EXISTS (
    SELECT 1 FROM public.kpi_mention_access m
    WHERE m.kpi_id = p_kpi_id AND m.user_id = _uid
  ) THEN
    RETURN true;
  END IF;

  -- Org-KPI data owner for this KPI's KRA/KPI pair
  IF EXISTS (
    SELECT 1
    FROM public.kpis k
    JOIN public.org_kpi_data_owners o
      ON o.owner_id = _uid
     AND o.category_id = k.category_id
     AND public.normalize_kpi_text(o.kra_name) = public.normalize_kpi_text(k.kra_name)
     AND public.normalize_kpi_text(o.kpi_name) = public.normalize_kpi_text(k.kpi_name)
    WHERE k.id = p_kpi_id
  ) THEN
    RETURN true;
  END IF;

  RETURN false;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.can_read_kpi_evidence(uuid) TO authenticated, anon, service_role;