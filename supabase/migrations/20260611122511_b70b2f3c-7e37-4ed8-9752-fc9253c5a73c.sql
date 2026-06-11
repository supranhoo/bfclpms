-- ============================================================
-- Safety Incident: add "Rework Required" loop.
-- Safety Head can send a reviewed incident back to the assignee with
-- mandatory remarks; assignee resubmits to safety_head_review.
-- ============================================================

-- 1) Additive enum value. IF NOT EXISTS so re-runs are safe.
ALTER TYPE public.safety_incident_status ADD VALUE IF NOT EXISTS 'rework_required';

-- Commit the enum addition before it can be referenced in function bodies.
COMMIT;
BEGIN;

-- 2) Extend transition_safety_incident to legalize the two new edges:
--      safety_head_review  -> rework_required   (Safety Head only, mandatory remarks via p_notes)
--      rework_required     -> safety_head_review (assigned investigator only)
--    All other transitions remain strictly sequential.

DROP FUNCTION IF EXISTS public.transition_safety_incident(uuid, safety_incident_status, text, uuid, text);
DROP FUNCTION IF EXISTS public.transition_safety_incident(uuid, safety_incident_status, text, uuid);

CREATE OR REPLACE FUNCTION public.transition_safety_incident(
  p_incident_id   uuid,
  p_to_status     safety_incident_status,
  p_notes         text DEFAULT NULL,
  p_assigned_to   uuid DEFAULT NULL,
  p_final_remarks text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_curr public.safety_incident_status;
  v_order int;
  v_next_order int;
  v_inc record;
  v_global_safety_head uuid;
  v_resolved_safety_head uuid;
  v_is_admin boolean := false;
  v_is_rework_send_back boolean := false;
  v_is_rework_resubmit  boolean := false;
  v_stages public.safety_incident_status[] := ARRAY[
    'reported','management_review','assigned','investigation','rca',
    'corrective_action','safety_head_review','closed'
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

  -- Identify the two non-sequential rework edges up front.
  v_is_rework_send_back := (v_curr = 'safety_head_review' AND p_to_status = 'rework_required');
  v_is_rework_resubmit  := (v_curr = 'rework_required'    AND p_to_status = 'safety_head_review');

  v_order      := array_position(v_stages, v_curr);
  v_next_order := array_position(v_stages, p_to_status);

  IF p_to_status = 'orphaned' THEN
    NULL;
  ELSIF p_to_status = 'verification' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'verification stage is retired');
  ELSIF v_is_rework_send_back OR v_is_rework_resubmit THEN
    NULL; -- legal non-sequential edges, validated below
  ELSIF v_next_order IS NULL OR v_order IS NULL OR v_next_order <> v_order + 1 THEN
    RETURN jsonb_build_object('ok', false, 'error', format('illegal transition: %s -> %s', v_curr, p_to_status));
  END IF;

  -- Resolve global Safety Head.
  SELECT NULLIF(COALESCE(value #>> '{value}', value #>> '{}'), '')::uuid
    INTO v_global_safety_head
    FROM public.safety_settings
   WHERE key = 'global_safety_head_id'
   LIMIT 1;

  v_resolved_safety_head := COALESCE(v_inc.safety_head_id, v_global_safety_head);

  BEGIN
    v_is_admin := public.has_role(v_user, 'admin'::app_role);
  EXCEPTION WHEN OTHERS THEN
    v_is_admin := false;
  END;

  IF p_to_status = 'assigned' THEN
    IF p_assigned_to IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'error', 'assigned_to required');
    END IF;
  ELSIF p_to_status = 'closed' THEN
    IF NOT v_is_admin AND (v_resolved_safety_head IS NULL OR v_user <> v_resolved_safety_head) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'only the Safety Head may close this incident');
    END IF;
  ELSIF v_is_rework_send_back THEN
    IF NOT v_is_admin AND (v_resolved_safety_head IS NULL OR v_user <> v_resolved_safety_head) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'only the Safety Head may request rework');
    END IF;
    IF p_notes IS NULL OR length(btrim(p_notes)) = 0 THEN
      RETURN jsonb_build_object('ok', false, 'error', 'rework remarks are mandatory');
    END IF;
    IF v_inc.assigned_to IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'error', 'incident has no assignee to send back to');
    END IF;
  ELSIF v_is_rework_resubmit THEN
    IF NOT v_is_admin AND (v_inc.assigned_to IS NULL OR v_user <> v_inc.assigned_to) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'only the assigned investigator may resubmit');
    END IF;
  END IF;

  PERFORM set_config('safety.fsm_transition', 'on', true);

  UPDATE public.safety_incidents
     SET status         = p_to_status,
         assigned_to    = COALESCE(p_assigned_to, assigned_to),
         assigned_at    = CASE WHEN p_to_status = 'assigned' THEN now() ELSE assigned_at END,
         safety_head_id = CASE WHEN p_to_status = 'safety_head_review'
                                 THEN COALESCE(safety_head_id, v_resolved_safety_head)
                                 ELSE safety_head_id END,
         verification_notes = CASE
                                WHEN p_to_status = 'closed' AND p_final_remarks IS NOT NULL AND p_final_remarks <> ''
                                  THEN p_final_remarks
                                ELSE verification_notes
                              END,
         closed_at      = CASE WHEN p_to_status = 'closed' THEN now() ELSE closed_at END,
         closed_by      = CASE WHEN p_to_status = 'closed' THEN v_user ELSE closed_by END
   WHERE id = p_incident_id;

  PERFORM set_config('safety.fsm_transition', 'off', true);

  INSERT INTO public.safety_incident_timeline (incident_id, from_status, to_status, changed_by, notes)
  VALUES (
    p_incident_id,
    v_curr,
    p_to_status,
    v_user,
    CASE
      WHEN p_to_status = 'closed' AND p_final_remarks IS NOT NULL AND p_final_remarks <> ''
        THEN COALESCE(NULLIF(p_notes, '') || E'\n\nFinal remarks: ', 'Final remarks: ') || p_final_remarks
      WHEN v_is_rework_send_back
        THEN 'Rework requested: ' || p_notes
      ELSE p_notes
    END
  );

  RETURN jsonb_build_object('ok', true, 'from', v_curr, 'to', p_to_status);
END;
$function$;

CREATE OR REPLACE FUNCTION public.transition_safety_incident(
  p_incident_id uuid,
  p_to_status   safety_incident_status,
  p_notes       text DEFAULT NULL,
  p_assigned_to uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT public.transition_safety_incident(p_incident_id, p_to_status, p_notes, p_assigned_to, NULL::text);
$$;

GRANT EXECUTE ON FUNCTION public.transition_safety_incident(uuid, safety_incident_status, text, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.transition_safety_incident(uuid, safety_incident_status, text, uuid) TO authenticated;