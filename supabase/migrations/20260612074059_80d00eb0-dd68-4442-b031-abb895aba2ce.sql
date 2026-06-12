-- Phase 2: Duplicate Incident Handling
ALTER TABLE public.safety_incidents
  ADD COLUMN IF NOT EXISTS duplicate_of_id uuid REFERENCES public.safety_incidents(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS marked_duplicate_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS marked_duplicate_at timestamptz,
  ADD COLUMN IF NOT EXISTS duplicate_remarks text;

CREATE INDEX IF NOT EXISTS idx_safety_incidents_duplicate_of ON public.safety_incidents(duplicate_of_id) WHERE duplicate_of_id IS NOT NULL;

-- Self-link guard
ALTER TABLE public.safety_incidents
  DROP CONSTRAINT IF EXISTS chk_safety_incidents_no_self_duplicate;
ALTER TABLE public.safety_incidents
  ADD CONSTRAINT chk_safety_incidents_no_self_duplicate CHECK (duplicate_of_id IS NULL OR duplicate_of_id <> id);

-- ============================================================
-- RPC: mark_incident_duplicate (BU Head only over the incident's BU)
-- ============================================================
CREATE OR REPLACE FUNCTION public.mark_incident_duplicate(
  p_incident_id uuid,
  p_master_id uuid,
  p_remarks text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_inc record;
  v_master record;
  v_is_bu_head boolean;
BEGIN
  IF v_user IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unauthenticated');
  END IF;
  IF p_incident_id IS NULL OR p_master_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'incident_id and master_id are required');
  END IF;
  IF p_incident_id = p_master_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'an incident cannot be marked duplicate of itself');
  END IF;
  IF COALESCE(btrim(p_remarks), '') = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'remarks are required when marking duplicate');
  END IF;

  SELECT * INTO v_inc FROM public.safety_incidents WHERE id = p_incident_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'incident not found');
  END IF;
  IF v_inc.status = 'closed' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'cannot mark a closed incident as duplicate');
  END IF;
  IF v_inc.marked_duplicate_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'incident is already marked as duplicate');
  END IF;

  SELECT * INTO v_master FROM public.safety_incidents WHERE id = p_master_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'master incident not found');
  END IF;
  IF v_master.duplicate_of_id IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'master incident is itself marked as duplicate');
  END IF;
  IF v_master.status = 'closed' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'master incident is already closed');
  END IF;

  -- Permission: only BU Head over this incident's BU (or admin override)
  SELECT
    public.has_safety_role(v_user, 'admin'::public.safety_app_role)
    OR EXISTS (
      SELECT 1 FROM public.safety_user_roles r
      WHERE r.user_id = v_user
        AND r.role = 'bu_head'::public.safety_app_role
        AND (r.business_unit_id IS NULL OR r.business_unit_id = v_inc.business_unit_id)
    )
  INTO v_is_bu_head;

  IF NOT v_is_bu_head THEN
    RETURN jsonb_build_object('ok', false, 'error', 'only BU Head over this business unit can mark duplicates');
  END IF;

  UPDATE public.safety_incidents
     SET duplicate_of_id = p_master_id,
         marked_duplicate_by = v_user,
         marked_duplicate_at = now(),
         duplicate_remarks = p_remarks
   WHERE id = p_incident_id;

  INSERT INTO public.safety_audit_log(event_type, entity_type, entity_id, performed_by, details)
  VALUES (
    'incident.marked_duplicate',
    'safety_incident',
    p_incident_id,
    v_user,
    jsonb_build_object(
      'master_incident_id', p_master_id,
      'master_incident_number', v_master.incident_number,
      'remarks', p_remarks
    )
  );

  RETURN jsonb_build_object('ok', true, 'incident_id', p_incident_id, 'master_id', p_master_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.mark_incident_duplicate(uuid, uuid, text) TO authenticated;

-- ============================================================
-- RPC: close_duplicate_incident (Safety Head / Admin only)
-- ============================================================
CREATE OR REPLACE FUNCTION public.close_duplicate_incident(
  p_incident_id uuid,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_inc record;
  v_authorized boolean;
BEGIN
  IF v_user IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unauthenticated');
  END IF;

  SELECT * INTO v_inc FROM public.safety_incidents WHERE id = p_incident_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'incident not found');
  END IF;
  IF v_inc.marked_duplicate_at IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'incident is not marked as duplicate');
  END IF;
  IF v_inc.status = 'closed' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'incident is already closed');
  END IF;

  v_authorized :=
    public.has_safety_role(v_user, 'admin'::public.safety_app_role)
    OR public.has_safety_role(v_user, 'safety_head'::public.safety_app_role);

  IF NOT v_authorized THEN
    RETURN jsonb_build_object('ok', false, 'error', 'only Safety Head or Admin can close duplicate incidents');
  END IF;

  PERFORM set_config('safety.fsm_transition', 'on', true);

  UPDATE public.safety_incidents
     SET status = 'closed',
         closed_at = now(),
         closed_by = v_user
   WHERE id = p_incident_id;

  PERFORM set_config('safety.fsm_transition', 'off', true);

  INSERT INTO public.safety_incident_timeline(incident_id, from_status, to_status, changed_by, notes)
  VALUES (p_incident_id, v_inc.status, 'closed', v_user, COALESCE(p_notes, 'Closed as duplicate'));

  INSERT INTO public.safety_audit_log(event_type, entity_type, entity_id, performed_by, details)
  VALUES (
    'incident.duplicate_closed',
    'safety_incident',
    p_incident_id,
    v_user,
    jsonb_build_object(
      'master_incident_id', v_inc.duplicate_of_id,
      'notes', p_notes,
      'from_status', v_inc.status
    )
  );

  RETURN jsonb_build_object('ok', true, 'incident_id', p_incident_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.close_duplicate_incident(uuid, text) TO authenticated;
