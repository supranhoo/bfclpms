
-- ============================================================================
-- Phase 1.D — Safety: Notifications + SLA escalation engine
-- ============================================================================

-- 1) Notifications table (in-app feed)
CREATE TABLE IF NOT EXISTS public.safety_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id uuid NOT NULL,
  incident_id uuid REFERENCES public.safety_incidents(id) ON DELETE CASCADE,
  kind text NOT NULL,           -- 'incident_reported' | 'incident_assigned' | 'stage_advanced' | 'sla_amber' | 'sla_red' | 'incident_closed'
  title text NOT NULL,
  body text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_read boolean NOT NULL DEFAULT false,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_safety_notifications_recipient_unread
  ON public.safety_notifications(recipient_id, is_read, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_safety_notifications_incident
  ON public.safety_notifications(incident_id);

ALTER TABLE public.safety_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "safety_notif_select_own"
  ON public.safety_notifications
  FOR SELECT TO authenticated
  USING (recipient_id = auth.uid());

CREATE POLICY "safety_notif_update_own"
  ON public.safety_notifications
  FOR UPDATE TO authenticated
  USING (recipient_id = auth.uid())
  WITH CHECK (recipient_id = auth.uid());

-- Only admins/safety_head can manually insert; trigger paths use SECURITY DEFINER fn
CREATE POLICY "safety_notif_admin_insert"
  ON public.safety_notifications
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_safety_role(auth.uid(), 'admin'::safety_app_role)
    OR public.has_safety_role(auth.uid(), 'safety_head'::safety_app_role)
  );

-- 2) Track SLA escalations to prevent duplicate notifications
CREATE TABLE IF NOT EXISTS public.safety_sla_escalations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id uuid NOT NULL REFERENCES public.safety_incidents(id) ON DELETE CASCADE,
  level text NOT NULL CHECK (level IN ('amber','red')),
  notified_at timestamptz NOT NULL DEFAULT now(),
  recipient_count integer NOT NULL DEFAULT 0,
  UNIQUE(incident_id, level)
);

ALTER TABLE public.safety_sla_escalations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "safety_sla_esc_select_safety_roles"
  ON public.safety_sla_escalations
  FOR SELECT TO authenticated
  USING (public.has_any_safety_role(auth.uid()));

-- 3) Helper: enqueue a notification (SECURITY DEFINER, bypass RLS for trigger paths)
CREATE OR REPLACE FUNCTION public.enqueue_safety_notification(
  _recipient uuid,
  _incident uuid,
  _kind text,
  _title text,
  _body text DEFAULT NULL,
  _payload jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _id uuid;
BEGIN
  IF _recipient IS NULL THEN RETURN NULL; END IF;

  INSERT INTO public.safety_notifications(
    recipient_id, incident_id, kind, title, body, payload
  ) VALUES (
    _recipient, _incident, _kind, _title, _body, COALESCE(_payload,'{}'::jsonb)
  )
  RETURNING id INTO _id;

  RETURN _id;
END;
$$;

REVOKE ALL ON FUNCTION public.enqueue_safety_notification(uuid, uuid, text, text, text, jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.enqueue_safety_notification(uuid, uuid, text, text, text, jsonb) TO authenticated, service_role;

-- 4) Trigger: on incident insert → notify Safety Officers + Safety Head
CREATE OR REPLACE FUNCTION public.trg_safety_incident_after_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _r record;
BEGIN
  FOR _r IN
    SELECT DISTINCT user_id
      FROM public.safety_user_roles
     WHERE role IN ('safety_head'::safety_app_role, 'safety_officer'::safety_app_role, 'admin'::safety_app_role)
  LOOP
    PERFORM public.enqueue_safety_notification(
      _r.user_id,
      NEW.id,
      'incident_reported',
      'New incident reported: ' || COALESCE(NEW.incident_number,''),
      NEW.title,
      jsonb_build_object('severity', NEW.severity, 'type', NEW.type)
    );
  END LOOP;

  -- Reporter receives confirmation
  PERFORM public.enqueue_safety_notification(
    NEW.reporter_id,
    NEW.id,
    'incident_reported',
    'Your incident was submitted: ' || COALESCE(NEW.incident_number,''),
    'We have logged your report. You will receive updates as it progresses.',
    jsonb_build_object('severity', NEW.severity)
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS safety_incident_after_insert ON public.safety_incidents;
CREATE TRIGGER safety_incident_after_insert
  AFTER INSERT ON public.safety_incidents
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_safety_incident_after_insert();

-- 5) Trigger: on stage transition → notify assignee + reporter
CREATE OR REPLACE FUNCTION public.trg_safety_incident_after_status_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    -- Notify reporter on every advancement
    IF NEW.reporter_id IS NOT NULL AND NEW.reporter_id <> COALESCE(NEW.assigned_to, '00000000-0000-0000-0000-000000000000'::uuid) THEN
      PERFORM public.enqueue_safety_notification(
        NEW.reporter_id, NEW.id,
        CASE WHEN NEW.status = 'closed'::safety_incident_status THEN 'incident_closed' ELSE 'stage_advanced' END,
        'Incident ' || COALESCE(NEW.incident_number,'') || ' → ' || NEW.status::text,
        NULL,
        jsonb_build_object('from', OLD.status, 'to', NEW.status)
      );
    END IF;

    -- Notify assignee when freshly assigned or stage advances
    IF NEW.assigned_to IS NOT NULL THEN
      PERFORM public.enqueue_safety_notification(
        NEW.assigned_to, NEW.id,
        CASE WHEN OLD.assigned_to IS DISTINCT FROM NEW.assigned_to THEN 'incident_assigned' ELSE 'stage_advanced' END,
        'Action required on ' || COALESCE(NEW.incident_number,'') || ' (' || NEW.status::text || ')',
        NEW.title,
        jsonb_build_object('from', OLD.status, 'to', NEW.status)
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS safety_incident_after_status_change ON public.safety_incidents;
CREATE TRIGGER safety_incident_after_status_change
  AFTER UPDATE OF status, assigned_to ON public.safety_incidents
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_safety_incident_after_status_change();

-- 6) SLA escalation engine — invoked by edge function cron
CREATE OR REPLACE FUNCTION public.run_safety_sla_escalations()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _amber_count int := 0;
  _red_count   int := 0;
  _r record;
  _level text;
  _recipients int;
  _u uuid;
BEGIN
  -- Pull open incidents with computed SLA state, skip already-notified at that level
  FOR _r IN
    SELECT v.id, v.incident_number, v.title, v.severity, v.status,
           v.assigned_to, v.reporter_id, v.sla_state
      FROM public.safety_incidents_with_sla v
     WHERE v.status <> 'closed'::safety_incident_status
       AND v.sla_state IN ('amber','red')
  LOOP
    _level := _r.sla_state;

    -- Idempotent guard
    BEGIN
      INSERT INTO public.safety_sla_escalations(incident_id, level, recipient_count)
      VALUES (_r.id, _level, 0);
    EXCEPTION WHEN unique_violation THEN
      CONTINUE;
    END;

    _recipients := 0;

    -- Notify assignee
    IF _r.assigned_to IS NOT NULL THEN
      PERFORM public.enqueue_safety_notification(
        _r.assigned_to, _r.id,
        CASE WHEN _level='red' THEN 'sla_red' ELSE 'sla_amber' END,
        'SLA ' || upper(_level) || ' on ' || COALESCE(_r.incident_number,''),
        _r.title,
        jsonb_build_object('severity', _r.severity, 'status', _r.status, 'level', _level)
      );
      _recipients := _recipients + 1;
    END IF;

    -- Notify Safety Head + Admin always, BU Head on red
    FOR _u IN
      SELECT DISTINCT user_id
        FROM public.safety_user_roles
       WHERE role IN ('safety_head'::safety_app_role, 'admin'::safety_app_role)
          OR (_level = 'red' AND role = 'bu_head'::safety_app_role)
    LOOP
      PERFORM public.enqueue_safety_notification(
        _u, _r.id,
        CASE WHEN _level='red' THEN 'sla_red' ELSE 'sla_amber' END,
        'SLA ' || upper(_level) || ' on ' || COALESCE(_r.incident_number,''),
        _r.title,
        jsonb_build_object('severity', _r.severity, 'status', _r.status, 'level', _level)
      );
      _recipients := _recipients + 1;
    END LOOP;

    UPDATE public.safety_sla_escalations
       SET recipient_count = _recipients
     WHERE incident_id = _r.id AND level = _level;

    IF _level = 'amber' THEN _amber_count := _amber_count + 1;
    ELSE _red_count := _red_count + 1; END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'amber_escalated', _amber_count,
    'red_escalated', _red_count,
    'ran_at', now()
  );
END;
$$;

REVOKE ALL ON FUNCTION public.run_safety_sla_escalations() FROM public;
GRANT EXECUTE ON FUNCTION public.run_safety_sla_escalations() TO service_role;
