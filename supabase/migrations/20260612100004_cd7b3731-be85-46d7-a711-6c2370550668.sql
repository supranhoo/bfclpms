
CREATE OR REPLACE FUNCTION public.trg_safety_incident_after_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _r record;
  _routed uuid;
  _global_head uuid;
BEGIN
  FOR _r IN
    SELECT DISTINCT user_id FROM public.safety_user_roles
     WHERE role IN ('safety_head'::safety_app_role,'safety_officer'::safety_app_role,'admin'::safety_app_role)
  LOOP
    PERFORM public.enqueue_safety_notification(
      _r.user_id, NEW.id, 'incident_reported',
      'New incident reported: ' || COALESCE(NEW.incident_number,''),
      NEW.title,
      jsonb_build_object('severity', NEW.severity, 'type', NEW.incident_type, 'routing_status', NEW.routing_status)
    );
  END LOOP;

  -- Global Safety Head (from safety_settings)
  SELECT NULLIF(trim(both '"' from value::text), '')::uuid INTO _global_head
    FROM public.safety_settings WHERE key = 'global_safety_head_id';
  IF _global_head IS NOT NULL THEN
    PERFORM public.enqueue_safety_notification(
      _global_head, NEW.id, 'incident_reported',
      'New incident reported: ' || COALESCE(NEW.incident_number,''),
      NEW.title,
      jsonb_build_object('severity', NEW.severity, 'type', NEW.incident_type, 'role', 'global_safety_head')
    );
  END IF;

  FOREACH _routed IN ARRAY ARRAY[NEW.routed_bu_head_id, NEW.routed_manager_id, NEW.routed_second_manager_id]
  LOOP
    IF _routed IS NOT NULL THEN
      PERFORM public.enqueue_safety_notification(
        _routed, NEW.id, 'incident_reported',
        'Incident routed to you: ' || COALESCE(NEW.incident_number,''),
        NEW.title,
        jsonb_build_object('severity', NEW.severity, 'type', NEW.incident_type, 'routing_source', NEW.routing_status)
      );
    END IF;
  END LOOP;

  PERFORM public.enqueue_safety_notification(
    NEW.reporter_id, NEW.id, 'incident_reported',
    'Your incident was submitted: ' || COALESCE(NEW.incident_number,''),
    'We have logged your report. You will receive updates as it progresses.',
    jsonb_build_object('severity', NEW.severity)
  );

  RETURN NEW;
END;
$function$;


CREATE OR REPLACE FUNCTION public.trg_safety_incident_after_status_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _r record;
  _global_head uuid;
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.reporter_id IS NOT NULL AND NEW.reporter_id <> COALESCE(NEW.assigned_to, '00000000-0000-0000-0000-000000000000'::uuid) THEN
      PERFORM public.enqueue_safety_notification(
        NEW.reporter_id, NEW.id,
        CASE WHEN NEW.status = 'closed'::safety_incident_status THEN 'incident_closed' ELSE 'stage_advanced' END,
        'Incident ' || COALESCE(NEW.incident_number,'') || ' → ' || NEW.status::text,
        NULL,
        jsonb_build_object('from', OLD.status, 'to', NEW.status)
      );
    END IF;

    IF NEW.assigned_to IS NOT NULL THEN
      PERFORM public.enqueue_safety_notification(
        NEW.assigned_to, NEW.id,
        CASE WHEN OLD.assigned_to IS DISTINCT FROM NEW.assigned_to THEN 'incident_assigned' ELSE 'stage_advanced' END,
        'Action required on ' || COALESCE(NEW.incident_number,'') || ' (' || NEW.status::text || ')',
        NEW.title,
        jsonb_build_object('from', OLD.status, 'to', NEW.status)
      );
    END IF;

    -- Safety Head review fan-out: safety_user_roles + global_safety_head_id
    IF NEW.status = 'safety_head_review'::safety_incident_status THEN
      FOR _r IN
        SELECT DISTINCT user_id FROM public.safety_user_roles
         WHERE role IN ('safety_head'::safety_app_role, 'admin'::safety_app_role)
      LOOP
        IF _r.user_id IS NOT NULL
           AND _r.user_id <> COALESCE(NEW.assigned_to, '00000000-0000-0000-0000-000000000000'::uuid) THEN
          PERFORM public.enqueue_safety_notification(
            _r.user_id, NEW.id, 'incident_assigned',
            'Safety Head review required on ' || COALESCE(NEW.incident_number,''),
            NEW.title,
            jsonb_build_object('from', OLD.status, 'to', NEW.status, 'role', 'safety_head')
          );
        END IF;
      END LOOP;

      SELECT NULLIF(trim(both '"' from value::text), '')::uuid INTO _global_head
        FROM public.safety_settings WHERE key = 'global_safety_head_id';
      IF _global_head IS NOT NULL
         AND _global_head <> COALESCE(NEW.assigned_to, '00000000-0000-0000-0000-000000000000'::uuid) THEN
        PERFORM public.enqueue_safety_notification(
          _global_head, NEW.id, 'incident_assigned',
          'Safety Head review required on ' || COALESCE(NEW.incident_number,''),
          NEW.title,
          jsonb_build_object('from', OLD.status, 'to', NEW.status, 'role', 'global_safety_head')
        );
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;
