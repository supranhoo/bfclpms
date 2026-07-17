
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

  -- Self.
  IF sender = target THEN
    RETURN true;
  END IF;

  -- Admin / HR-PMS sender OR admin / HR-PMS target (employees may notify HR/Admin).
  IF public.has_role(sender, 'admin'::app_role)
     OR public.has_role(sender, 'hr_pms'::app_role)
     OR public.has_role(target, 'admin'::app_role)
     OR public.has_role(target, 'hr_pms'::app_role) THEN
    RETURN true;
  END IF;

  -- Downward org relationships: sender is target's manager/skip/dept-head/BU-head.
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
       OR d.head_id                = sender
       OR bu.head_user_id          = sender
     )
   LIMIT 1;
  IF v_ok THEN RETURN true; END IF;

  -- Upward org relationships: target is sender's manager/skip/dept-head/BU-head.
  SELECT true INTO v_ok
    FROM public.profiles p
    LEFT JOIN public.profiles mgr    ON mgr.id    = p.reporting_manager_id
    LEFT JOIN public.departments d   ON d.id      = p.department_id
    LEFT JOIN public.business_units bu ON bu.id   = d.business_unit_id
   WHERE p.id = sender
     AND (
          p.reporting_manager_id   = target
       OR p.functional_manager_id  = target
       OR mgr.reporting_manager_id = target
       OR d.head_id                = target
       OR bu.head_user_id          = target
     )
   LIMIT 1;
  IF v_ok THEN RETURN true; END IF;

  -- KPI reviewer relationship — either direction.
  IF EXISTS (
    SELECT 1 FROM public.kpis k
     WHERE (k.assigned_to = target
            AND (k.manager_id = sender OR k.skip_manager_id = sender
                 OR k.hr_id = sender OR k.auditor_id = sender
                 OR k.management_id = sender))
        OR (k.assigned_to = sender
            AND (k.manager_id = target OR k.skip_manager_id = target
                 OR k.hr_id = target OR k.auditor_id = target
                 OR k.management_id = target))
     LIMIT 1
  ) THEN
    RETURN true;
  END IF;

  -- Annual-review reviewer relationship — either direction, plus peer reviewers on same instance.
  IF EXISTS (
    SELECT 1 FROM public.annual_review_instances i
     WHERE (i.employee_id = target
            AND (i.manager_id = sender OR i.skip_id = sender
                 OR i.dept_head_id = sender OR i.bu_head_id = sender
                 OR i.hr_id = sender))
        OR (i.employee_id = sender
            AND (i.manager_id = target OR i.skip_id = target
                 OR i.dept_head_id = target OR i.bu_head_id = target
                 OR i.hr_id = target))
        OR (sender IN (i.manager_id, i.skip_id, i.dept_head_id, i.bu_head_id, i.hr_id)
            AND target IN (i.employee_id, i.manager_id, i.skip_id, i.dept_head_id, i.bu_head_id, i.hr_id))
     LIMIT 1
  ) THEN
    RETURN true;
  END IF;

  RETURN false;
END;
$$;

REVOKE ALL ON FUNCTION public.can_send_notification_to(uuid, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.can_send_notification_to(uuid, uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.can_send_notification_to IS
  'Bidirectional notification sender authorization. Allows self, admin/HR (either party), downward org (manager/skip/dept/BU head → subordinate), upward org (subordinate → manager/skip/dept/BU head), KPI reviewer↔subject (both directions), and Annual Review employee↔reviewer plus peer reviewers on the same instance. See POLICY §108b and ADR-112.';
