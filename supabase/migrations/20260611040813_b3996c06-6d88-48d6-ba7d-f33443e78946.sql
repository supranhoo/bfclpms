
-- ADR-089: Orphan Incident Revival RPC
-- Adds an explicit, audited exception path for transitioning an
-- 'orphaned' incident back into the FSM (-> 'assigned'). Generic
-- transition_safety_incident still rejects 'orphaned' transitions
-- so the FSM guard remains the SSOT.

CREATE OR REPLACE FUNCTION public.revive_orphaned_safety_incident(
  p_incident_id uuid,
  p_assigned_to uuid,
  p_notes       text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor   uuid := auth.uid();
  v_status  safety_incident_status;
  v_target  uuid;
BEGIN
  IF v_actor IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  -- Only admin / safety_head may revive orphaned incidents.
  IF NOT (
    public.has_safety_role(v_actor, 'safety_admin')
    OR public.has_safety_role(v_actor, 'safety_head')
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  SELECT status INTO v_status FROM public.safety_incidents WHERE id = p_incident_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;
  IF v_status <> 'orphaned' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_orphaned', 'status', v_status);
  END IF;

  -- Validate target assignee exists and is active.
  SELECT id INTO v_target
  FROM public.profiles
  WHERE id = p_assigned_to AND COALESCE(is_active, true) = true;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_assignee');
  END IF;

  -- Bypass the FSM guard via session flag (read by safety_incident_fsm_guard).
  PERFORM set_config('app.safety_fsm_bypass', 'orphan_revival', true);

  UPDATE public.safety_incidents
     SET status      = 'assigned',
         assigned_to = v_target,
         assigned_at = now(),
         updated_at  = now()
   WHERE id = p_incident_id;

  PERFORM set_config('app.safety_fsm_bypass', '', true);

  INSERT INTO public.safety_incident_timeline (incident_id, from_status, to_status, changed_by, notes)
  VALUES (p_incident_id, 'orphaned', 'assigned', v_actor,
          COALESCE(NULLIF(trim(p_notes), ''), 'Revived from orphaned'));

  RETURN jsonb_build_object('ok', true, 'incident_id', p_incident_id, 'assigned_to', v_target);
END;
$$;

REVOKE ALL ON FUNCTION public.revive_orphaned_safety_incident(uuid, uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION public.revive_orphaned_safety_incident(uuid, uuid, text) TO authenticated;

-- Update the FSM guard to honour the orphan-revival session flag.
-- (Keep all other rules intact.)
CREATE OR REPLACE FUNCTION public.safety_incident_fsm_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_bypass text := current_setting('app.safety_fsm_bypass', true);
BEGIN
  -- Same-status updates allowed (no transition occurring).
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  -- Explicit, audited bypass set by SECURITY DEFINER RPCs only.
  IF v_bypass IN ('orphan_revival') THEN
    RETURN NEW;
  END IF;

  -- Otherwise: only the RPC path (transition_safety_incident) may change status.
  RAISE EXCEPTION 'safety_incidents.status may only be changed via transition_safety_incident()'
    USING ERRCODE = 'check_violation';
END;
$$;
