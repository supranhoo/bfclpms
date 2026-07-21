-- ADR-131 / POLICY §108e — Auditor↔Reviewer bidirectional notification guard
-- Fixes: "not authorized to send notifications to user <auditor>" toast when a
-- reporting manager (Umesh Mehta) approves/sends-back a KPI whose auditor is
-- Auditor03 (f9556e9b-4d12-4374-b290-a397fe1de334). Previous guard (ADR-112)
-- only recognized sender=auditor↔target=employee; the mirror where sender is
-- the employee's reviewer chain and target is the auditor was missing.

CREATE OR REPLACE FUNCTION public.can_send_notification_to(sender uuid, target uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_ok boolean;
BEGIN
  IF sender IS NULL OR target IS NULL THEN
    RETURN false;
  END IF;

  IF sender = target THEN
    RETURN true;
  END IF;

  -- Global operational senders; employees may also notify Admin / HR PMS.
  IF public.has_role(sender, 'admin'::app_role)
     OR public.has_role(sender, 'hr_pms'::app_role)
     OR public.has_role(sender, 'management'::app_role)
     OR public.has_role(sender, 'auditor'::app_role)
     OR public.has_role(target, 'admin'::app_role)
     OR public.has_role(target, 'hr_pms'::app_role) THEN
    RETURN true;
  END IF;

  -- Bidirectional organization hierarchy.
  SELECT true INTO v_ok
    FROM public.profiles p
    LEFT JOIN public.profiles mgr      ON mgr.id = p.reporting_manager_id
    LEFT JOIN public.departments d     ON d.id = p.department_id
    LEFT JOIN public.business_units bu ON bu.id = d.business_unit_id
   WHERE (p.id = target AND (
          p.reporting_manager_id = sender
       OR p.functional_manager_id = sender
       OR mgr.reporting_manager_id = sender
       OR d.head_user_id = sender
       OR bu.head_user_id = sender
   )) OR (p.id = sender AND (
          p.reporting_manager_id = target
       OR p.functional_manager_id = target
       OR mgr.reporting_manager_id = target
       OR d.head_user_id = target
       OR bu.head_user_id = target
   ))
   LIMIT 1;
  IF v_ok THEN RETURN true; END IF;

  -- Bidirectional employee↔auditor relationship at employee or KPI level.
  IF EXISTS (
    SELECT 1
      FROM public.audit_kpi_assignments a
     WHERE (a.auditor_id = sender AND a.employee_id = target)
        OR (a.auditor_id = target AND a.employee_id = sender)
     LIMIT 1
  ) OR EXISTS (
    SELECT 1
      FROM public.audit_kpi_level_assignments la
      JOIN public.kpis k ON k.id = la.kpi_id
     WHERE (la.auditor_id = sender AND k.employee_id = target)
        OR (la.auditor_id = target AND k.employee_id = sender)
     LIMIT 1
  ) THEN
    RETURN true;
  END IF;

  -- ADR-131 (POLICY §108e): Auditor↔Reviewer of audited employee.
  -- If either party is an auditor of any KPI whose OWNING EMPLOYEE is in the
  -- other party's reviewer chain (reporting/functional manager, skip, dept
  -- head, BU head), allow the notification. This covers the manager-approves
  -- -audited-KPI notification path.
  SELECT true INTO v_ok
  FROM public.profiles emp
  LEFT JOIN public.profiles mgr      ON mgr.id = emp.reporting_manager_id
  LEFT JOIN public.departments d     ON d.id = emp.department_id
  LEFT JOIN public.business_units bu ON bu.id = d.business_unit_id
  WHERE
    (
      -- target audits emp; sender is emp's reviewer chain
      (EXISTS (SELECT 1 FROM public.audit_kpi_assignments a
                 WHERE a.auditor_id = target AND a.employee_id = emp.id)
       OR EXISTS (SELECT 1 FROM public.audit_kpi_level_assignments la
                    JOIN public.kpis k ON k.id = la.kpi_id
                   WHERE la.auditor_id = target AND k.employee_id = emp.id))
      AND (sender = emp.reporting_manager_id
        OR sender = emp.functional_manager_id
        OR sender = mgr.reporting_manager_id
        OR sender = d.head_user_id
        OR sender = bu.head_user_id)
    )
    OR
    (
      -- sender audits emp; target is emp's reviewer chain
      (EXISTS (SELECT 1 FROM public.audit_kpi_assignments a
                 WHERE a.auditor_id = sender AND a.employee_id = emp.id)
       OR EXISTS (SELECT 1 FROM public.audit_kpi_level_assignments la
                    JOIN public.kpis k ON k.id = la.kpi_id
                   WHERE la.auditor_id = sender AND k.employee_id = emp.id))
      AND (target = emp.reporting_manager_id
        OR target = emp.functional_manager_id
        OR target = mgr.reporting_manager_id
        OR target = d.head_user_id
        OR target = bu.head_user_id)
    )
  LIMIT 1;
  IF v_ok THEN RETURN true; END IF;

  -- Annual Review employee/reviewer relationships and reviewer peer hand-offs.
  IF EXISTS (
    SELECT 1
      FROM public.annual_review_instances i
     WHERE (i.employee_id = target
            AND sender IN (i.manager_id, i.skip_id, i.dept_head_id, i.bu_head_id, i.hr_id))
        OR (i.employee_id = sender
            AND target IN (i.manager_id, i.skip_id, i.dept_head_id, i.bu_head_id, i.hr_id))
        OR (sender IN (i.manager_id, i.skip_id, i.dept_head_id, i.bu_head_id, i.hr_id)
            AND target IN (i.employee_id, i.manager_id, i.skip_id, i.dept_head_id, i.bu_head_id, i.hr_id))
     LIMIT 1
  ) THEN
    RETURN true;
  END IF;

  -- Authorized assisted submitter may notify the employee or a reviewer.
  IF EXISTS (
    SELECT 1
      FROM public.annual_review_proxy_submissions ps
      JOIN public.annual_review_instances i ON i.id = ps.instance_id
     WHERE ps.proxy_user_id = sender
       AND target IN (i.employee_id, i.manager_id, i.skip_id, i.dept_head_id, i.bu_head_id, i.hr_id)
     LIMIT 1
  ) THEN
    RETURN true;
  END IF;

  RETURN false;
END;
$function$;