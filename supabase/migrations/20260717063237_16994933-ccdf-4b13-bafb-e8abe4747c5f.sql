
-- Helper: does `sender` have a legitimate relationship to notify `target`?
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

  -- Self-notifications always allowed.
  IF sender = target THEN
    RETURN true;
  END IF;

  -- Admin / HR-PMS may notify any user (org-wide administrative scope).
  IF public.has_role(sender, 'admin'::app_role)
     OR public.has_role(sender, 'hr_pms'::app_role) THEN
    RETURN true;
  END IF;

  -- Direct organizational relationships: manager / functional manager / skip / dept head / bu head.
  SELECT true INTO v_ok
    FROM public.profiles p
    LEFT JOIN public.profiles mgr    ON mgr.id    = p.reporting_manager_id
    LEFT JOIN public.departments d   ON d.id      = p.department_id
    LEFT JOIN public.business_units bu ON bu.id   = d.business_unit_id
   WHERE p.id = target
     AND (
          p.reporting_manager_id   = sender
       OR p.functional_manager_id  = sender
       OR mgr.reporting_manager_id = sender   -- skip-level
       OR d.head_id                = sender   -- dept head (if column exists on departments)
       OR bu.head_user_id          = sender   -- bu head
     )
   LIMIT 1;
  IF v_ok THEN RETURN true; END IF;

  -- Reviewer/auditor relationship via KPIs: sender is a reviewer in the target's KRA chain.
  IF EXISTS (
    SELECT 1 FROM public.kpis k
     WHERE k.assigned_to = target
       AND (k.manager_id = sender OR k.skip_manager_id = sender
            OR k.hr_id = sender OR k.auditor_id = sender
            OR k.management_id = sender)
     LIMIT 1
  ) THEN
    RETURN true;
  END IF;

  -- Annual-review reviewer relationship.
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

REVOKE ALL ON FUNCTION public.can_send_notification_to(uuid, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.can_send_notification_to(uuid, uuid) TO authenticated, service_role;

-- BEFORE INSERT trigger: enforce legitimate relationship + stamp sender identity.
-- Service role bypasses RLS entirely (auth.uid() IS NULL), so this only fires
-- for authenticated user inserts. Bulk inserts are evaluated per-row.
CREATE OR REPLACE FUNCTION public.tg_notifications_enforce_sender_relationship()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid := auth.uid();
BEGIN
  -- Server-side / trigger context (no JWT): allow unchanged. Service role
  -- and DB triggers legitimately create notifications on behalf of the system.
  IF v_caller IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.user_id IS NULL THEN
    RAISE EXCEPTION 'notifications.user_id is required'
      USING ERRCODE = '23502';
  END IF;

  -- Always attribute the sender so recipients see who triggered the message.
  IF NEW.related_user_id IS NULL AND NEW.user_id <> v_caller THEN
    NEW.related_user_id := v_caller;
  END IF;

  IF NOT public.can_send_notification_to(v_caller, NEW.user_id) THEN
    RAISE EXCEPTION 'not authorized to send notifications to user %', NEW.user_id
      USING ERRCODE = '42501',
            HINT   = 'Sender must be admin, HR PMS, or have a manager/reviewer relationship with the recipient.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notifications_enforce_sender_relationship
  ON public.notifications;
CREATE TRIGGER notifications_enforce_sender_relationship
  BEFORE INSERT ON public.notifications
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_notifications_enforce_sender_relationship();
