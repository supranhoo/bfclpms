CREATE OR REPLACE FUNCTION public.trg_safety_incident_after_status_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _r record;
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

    -- Fan-out to Safety Head on review-stage entry
    IF NEW.status = 'safety_head_review'::safety_incident_status THEN
      FOR _r IN
        SELECT DISTINCT user_id FROM public.safety_user_roles
         WHERE role IN ('safety_head'::safety_app_role, 'admin'::safety_app_role)
      LOOP
        IF _r.user_id IS NOT NULL
           AND _r.user_id <> COALESCE(NEW.assigned_to, '00000000-0000-0000-0000-000000000000'::uuid)
           AND _r.user_id <> COALESCE(NEW.reporter_id, '00000000-0000-0000-0000-000000000000'::uuid) THEN
          PERFORM public.enqueue_safety_notification(
            _r.user_id, NEW.id, 'incident_assigned',
            'Safety Head review required on ' || COALESCE(NEW.incident_number,''),
            NEW.title,
            jsonb_build_object('from', OLD.status, 'to', NEW.status, 'role', 'safety_head')
          );
        END IF;
      END LOOP;
    END IF;

    -- Fan-out to BU Head on management_review entry
    IF NEW.status = 'management_review'::safety_incident_status THEN
      FOR _r IN
        SELECT DISTINCT user_id FROM public.safety_user_roles
         WHERE role IN ('bu_head'::safety_app_role, 'admin'::safety_app_role)
      LOOP
        IF _r.user_id IS NOT NULL
           AND _r.user_id <> COALESCE(NEW.assigned_to, '00000000-0000-0000-0000-000000000000'::uuid)
           AND _r.user_id <> COALESCE(NEW.reporter_id, '00000000-0000-0000-0000-000000000000'::uuid) THEN
          PERFORM public.enqueue_safety_notification(
            _r.user_id, NEW.id, 'incident_assigned',
            'Management review required on ' || COALESCE(NEW.incident_number,''),
            NEW.title,
            jsonb_build_object('from', OLD.status, 'to', NEW.status, 'role', 'bu_head')
          );
        END IF;
      END LOOP;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;