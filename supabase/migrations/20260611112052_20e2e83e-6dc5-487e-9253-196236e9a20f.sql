CREATE OR REPLACE FUNCTION public.transition_safety_incident(
  p_incident_id uuid,
  p_to_status   public.safety_incident_status,
  p_notes       text DEFAULT NULL::text,
  p_assigned_to uuid DEFAULT NULL::uuid,
  p_verifier_id uuid DEFAULT NULL::uuid
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_curr public.safety_incident_status;
  v_order int;
  v_next_order int;
  v_evidence_count int;
  v_progress_count int;
  v_inc record;
  v_global_safety_head uuid;
  v_resolved_safety_head uuid;
  v_stages public.safety_incident_status[] := ARRAY[
    'reported','management_review','assigned','investigation','rca',
    'corrective_action','safety_head_review','verification','closed'
  ]::public.safety_incident_status[];
BEGIN
  IF v_user IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unauthenticated');
  END IF;

  SELECT * INTO v_inc FROM public.safety_incidents WHERE id = p_incident_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'incident not found');
  END IF;

  v_curr := v_inc.status;
  v_order      := array_position(v_stages, v_curr);
  v_next_order := array_position(v_stages, p_to_status);

  IF p_to_status = 'orphaned' THEN
    NULL;
  ELSIF v_next_order IS NULL OR v_order IS NULL OR v_next_order <> v_order + 1 THEN
    RETURN jsonb_build_object('ok', false, 'error', format('illegal transition: %s -> %s', v_curr, p_to_status));
  END IF;

  IF p_to_status = 'assigned' THEN
    IF p_assigned_to IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'error', 'assigned_to required');
    END IF;
  ELSIF p_to_status = 'verification' THEN
    IF p_verifier_id IS NULL AND v_inc.verifier_id IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'error', 'verifier_id required');
    END IF;
  ELSIF p_to_status = 'closed' THEN
    SELECT COUNT(*) INTO v_evidence_count
      FROM public.safety_incident_evidence
      WHERE incident_id = p_incident_id AND stage = 'verification';
    IF v_evidence_count < 1 THEN
      RETURN jsonb_build_object('ok', false, 'error', 'verification evidence required to close');
    END IF;
    SELECT COUNT(*) INTO v_progress_count
      FROM public.safety_incident_progress_logs
      WHERE incident_id = p_incident_id;
    IF v_progress_count < 1 THEN
      RETURN jsonb_build_object('ok', false, 'error', 'at least one progress log required');
    END IF;
    IF COALESCE(v_inc.verification_notes, '') = '' THEN
      RETURN jsonb_build_object('ok', false, 'error', 'verification_notes required');
    END IF;
  END IF;

  -- Resolve Safety Head from configured global setting (NEVER stamp acting user).
  IF p_to_status = 'safety_head_review' THEN
    SELECT NULLIF(
             COALESCE(value #>> '{value}', value #>> '{}'),
             ''
           )::uuid
      INTO v_global_safety_head
      FROM public.safety_settings
     WHERE key = 'global_safety_head_id'
     LIMIT 1;
    v_resolved_safety_head := COALESCE(v_inc.safety_head_id, v_global_safety_head);
  ELSE
    v_resolved_safety_head := v_inc.safety_head_id;
  END IF;

  PERFORM set_config('safety.fsm_transition', 'on', true);

  UPDATE public.safety_incidents
     SET status        = p_to_status,
         assigned_to   = COALESCE(p_assigned_to, assigned_to),
         assigned_at   = CASE WHEN p_to_status = 'assigned' THEN now() ELSE assigned_at END,
         safety_head_id = v_resolved_safety_head,
         verifier_id   = COALESCE(p_verifier_id, verifier_id),
         closed_at     = CASE WHEN p_to_status = 'closed' THEN now() ELSE closed_at END,
         closed_by     = CASE WHEN p_to_status = 'closed' THEN v_user ELSE closed_by END
   WHERE id = p_incident_id;

  PERFORM set_config('safety.fsm_transition', 'off', true);

  INSERT INTO public.safety_incident_timeline (incident_id, from_status, to_status, changed_by, notes)
  VALUES (p_incident_id, v_curr, p_to_status, v_user, p_notes);

  RETURN jsonb_build_object('ok', true, 'from', v_curr, 'to', p_to_status);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.transition_safety_incident(uuid, public.safety_incident_status, text, uuid, uuid) TO authenticated;

-- Repair existing incidents currently at safety_head_review where safety_head_id
-- was incorrectly stamped with the investigator (assigned_to). Re-point to the
-- configured global Safety Head.
UPDATE public.safety_incidents i
   SET safety_head_id = (
     SELECT NULLIF(COALESCE(value #>> '{value}', value #>> '{}'), '')::uuid
       FROM public.safety_settings WHERE key = 'global_safety_head_id' LIMIT 1
   )
 WHERE i.status = 'safety_head_review'
   AND i.safety_head_id IS NOT NULL
   AND i.safety_head_id = i.assigned_to;