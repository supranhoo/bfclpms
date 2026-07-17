
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

  IF public.has_role(sender, 'admin'::app_role)
     OR public.has_role(sender, 'hr_pms'::app_role)
     OR public.has_role(sender, 'management'::app_role) THEN
    RETURN true;
  END IF;

  SELECT true INTO v_ok
    FROM public.profiles p
    LEFT JOIN public.profiles mgr      ON mgr.id = p.reporting_manager_id
    LEFT JOIN public.departments d     ON d.id = p.department_id
    LEFT JOIN public.business_units bu ON bu.id = d.business_unit_id
   WHERE p.id = target
     AND (
          p.reporting_manager_id   = sender
       OR p.functional_manager_id  = sender
       OR mgr.reporting_manager_id = sender
       OR d.head_user_id           = sender
       OR bu.head_user_id          = sender
     )
   LIMIT 1;
  IF v_ok THEN RETURN true; END IF;

  IF public.has_role(sender, 'auditor'::app_role)
     AND (
       EXISTS (
         SELECT 1
           FROM public.audit_kpi_assignments a
          WHERE a.auditor_id = sender
            AND a.employee_id = target
          LIMIT 1
       )
       OR EXISTS (
         SELECT 1
           FROM public.audit_kpi_level_assignments la
           JOIN public.kpis k ON k.id = la.kpi_id
          WHERE la.auditor_id = sender
            AND k.employee_id = target
          LIMIT 1
       )
     ) THEN
    RETURN true;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.annual_review_instances i
     WHERE i.employee_id = target
       AND (i.manager_id = sender OR i.skip_id = sender
            OR i.dept_head_id = sender OR i.bu_head_id = sender
            OR i.hr_id = sender)
     LIMIT 1
  ) THEN
    RETURN true;
  END IF;

  -- Assisted / proxy annual-review submitters: allow notifying the employee
  -- they submitted for, and any reviewer on that instance.
  IF EXISTS (
    SELECT 1
      FROM public.annual_review_proxy_submissions ps
      JOIN public.annual_review_instances i ON i.id = ps.instance_id
     WHERE ps.proxy_user_id = sender
       AND (
            i.employee_id = target
         OR i.manager_id  = target
         OR i.skip_id     = target
         OR i.dept_head_id = target
         OR i.bu_head_id  = target
         OR i.hr_id       = target
       )
     LIMIT 1
  ) THEN
    RETURN true;
  END IF;

  RETURN false;
END;
$function$;
