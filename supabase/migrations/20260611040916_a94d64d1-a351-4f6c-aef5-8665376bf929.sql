
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

  IF NOT (
    public.has_safety_role(v_actor, 'admin'::safety_app_role)
    OR public.has_safety_role(v_actor, 'safety_head'::safety_app_role)
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

  SELECT id INTO v_target
  FROM public.profiles
  WHERE id = p_assigned_to AND COALESCE(is_active, true) = true;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_assignee');
  END IF;

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
