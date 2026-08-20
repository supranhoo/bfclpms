-- ADR-303 / POLICY §EVIDENCE-PREVIEW-AUTHORIZATION-PLAN
-- Consolidate overlapping review-evidence SELECT policies without widening access.
DROP POLICY IF EXISTS "Users can view authorized evidence" ON storage.objects;
DROP POLICY IF EXISTS "Observation evidence readable by KPI participants" ON storage.objects;

CREATE INDEX IF NOT EXISTS idx_okdo_owner_id
  ON public.org_kpi_data_owners (owner_id);

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

  SELECT k.employee_id
  INTO _employee_id
  FROM public.kpis k
  WHERE k.id = p_kpi_id;

  IF _employee_id IS NULL THEN
    RETURN EXISTS (
      SELECT 1
      FROM public.kpi_mention_access m
      WHERE m.kpi_id = p_kpi_id
        AND m.user_id = _uid
    );
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

  IF EXISTS (
    SELECT 1
    FROM public.kpi_mention_access m
    WHERE m.kpi_id = p_kpi_id
      AND m.user_id = _uid
  ) THEN
    RETURN true;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.audit_kpi_assignments a
    WHERE a.employee_id = _employee_id
      AND a.auditor_id = _uid
  ) OR EXISTS (
    SELECT 1
    FROM public.audit_kpi_level_assignments la
    WHERE la.kpi_id = p_kpi_id
      AND la.auditor_id = _uid
  ) THEN
    RETURN true;
  END IF;

  IF public.get_skip_level_manager(_employee_id) = _uid THEN
    RETURN true;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.org_kpi_data_owners o
    JOIN public.kpis k
      ON k.id = p_kpi_id
     AND o.category_id = k.category_id
     AND public.normalize_kpi_text(o.kra_name) = public.normalize_kpi_text(k.kra_name)
     AND public.normalize_kpi_text(o.kpi_name) = public.normalize_kpi_text(k.kpi_name)
    WHERE o.owner_id = _uid
  ) THEN
    RETURN true;
  END IF;

  RETURN false;
END;
$function$;

REVOKE ALL ON FUNCTION public.can_read_kpi_evidence(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_read_kpi_evidence(uuid) TO authenticated, service_role;