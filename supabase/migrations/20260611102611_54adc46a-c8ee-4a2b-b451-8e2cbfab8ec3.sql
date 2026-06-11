CREATE OR REPLACE FUNCTION public.safety_incident_fsm_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_bypass    text := current_setting('app.safety_fsm_bypass', true);
  v_fsm_flag  text := current_setting('safety.fsm_transition', true);
BEGIN
  -- Same-status updates allowed (no transition occurring).
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  -- Explicit, audited bypass set by SECURITY DEFINER RPCs only.
  IF v_bypass IN ('orphan_revival','fsm_transition') THEN
    RETURN NEW;
  END IF;

  -- Bypass key actually set by public.transition_safety_incident().
  IF v_fsm_flag = 'on' THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'safety_incidents.status may only be changed via transition_safety_incident()'
    USING ERRCODE = 'check_violation';
END;
$function$;