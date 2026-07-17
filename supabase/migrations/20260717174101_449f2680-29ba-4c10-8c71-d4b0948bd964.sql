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
  -- Auditor is an operational global role per Auditor Access Expansion (POLICY §108d).
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

  -- Bidirectional employee/auditor relationship at employee or KPI level.
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

-- Security fix: incentive rate tables broad read.
-- Remove permissive "true" SELECT policies so role/menu-scoped policies apply.
DROP POLICY IF EXISTS "Authenticated users can read production rates" ON public.incentive_production_rates;
DROP POLICY IF EXISTS "Authenticated can read vessel rates" ON public.incentive_vessel_rates;