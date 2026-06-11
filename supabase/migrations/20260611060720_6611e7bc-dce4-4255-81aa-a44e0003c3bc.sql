CREATE OR REPLACE FUNCTION public.trg_safety_incident_after_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
      jsonb_build_object('severity', NEW.severity, 'type', NEW.incident_type)
    );
  END LOOP;

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
$function$;