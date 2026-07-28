CREATE OR REPLACE FUNCTION public.is_org_kpi_audit_employee(_profile_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM kpis k
    WHERE k.employee_id = _profile_id
      AND k.is_org_level = true
      AND k.status IN ('audit', 'management_review', 'approved')
      AND (
        EXISTS (
          SELECT 1 FROM audit_kpi_assignments a
          WHERE a.auditor_id = auth.uid()
            AND a.employee_id = _profile_id
        )
        OR EXISTS (
          SELECT 1 FROM audit_kpi_level_assignments la
          WHERE la.auditor_id = auth.uid()
            AND la.kpi_id = k.id
        )
      )
  )
$function$;