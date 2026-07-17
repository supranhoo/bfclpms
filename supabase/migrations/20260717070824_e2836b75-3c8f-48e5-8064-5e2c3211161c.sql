CREATE OR REPLACE FUNCTION public.can_send_notification_to(sender uuid, target uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
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
     OR public.has_role(sender, 'hr_pms'::app_role) THEN
    RETURN true;
  END IF;

  SELECT true INTO v_ok
    FROM public.profiles p
    LEFT JOIN public.profiles mgr    ON mgr.id    = p.reporting_manager_id
    LEFT JOIN public.departments d   ON d.id      = p.department_id
    LEFT JOIN public.business_units bu ON bu.id   = d.business_unit_id
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

  IF EXISTS (
    SELECT 1 FROM public.kpis k
     WHERE k.employee_id = target
       AND (k.manager_id = sender OR k.skip_manager_id = sender
            OR k.hr_id = sender OR k.auditor_id = sender
            OR k.management_id = sender)
     LIMIT 1
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

  RETURN false;
END;
$$;