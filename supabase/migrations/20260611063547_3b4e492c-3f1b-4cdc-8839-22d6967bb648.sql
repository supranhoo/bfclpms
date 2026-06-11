
-- Refresh SLA view to expose new ownership columns
CREATE OR REPLACE VIEW public.safety_incidents_with_sla AS
SELECT id, incident_number, client_submission_id, reporter_id,
       business_unit_id, department_id, incident_type, severity, status,
       title, description, location, occurred_at,
       involved_person_id, involved_person_name,
       assigned_to, assigned_at, acknowledge_due_at, close_due_at,
       closed_at, closed_by, rca_summary, capa_summary, verification_notes,
       created_at, updated_at,
       CASE
         WHEN status = 'closed'::safety_incident_status THEN 'closed'
         WHEN now() > close_due_at THEN 'red'
         WHEN now() > (close_due_at - (close_due_at - created_at) * 0.25) THEN 'amber'
         ELSE 'green'
       END AS sla_state,
       routed_bu_head_id, routed_manager_id, routed_second_manager_id, routing_status,
       safety_head_id, verifier_id
FROM public.safety_incidents i;

GRANT SELECT ON public.safety_incidents_with_sla TO authenticated;

-- report_safety_incident: auto-place into 'management_review' when routed
CREATE OR REPLACE FUNCTION public.report_safety_incident(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_csid uuid;
  v_csid_raw text;
  v_existing record;
  v_new record;
  v_bu uuid;
  v_dept uuid;
  v_route record;
  v_routing_status text := 'unrouted';
  v_bu_head uuid;
  v_mgr uuid;
  v_mgr2 uuid;
  v_initial_status public.safety_incident_status := 'reported';
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;
  v_csid_raw := NULLIF(p_payload->>'client_submission_id', '');
  IF v_csid_raw IS NULL THEN
    RAISE EXCEPTION 'client_submission_id_required' USING ERRCODE = '22023';
  END IF;
  BEGIN
    v_csid := v_csid_raw::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'client_submission_id_invalid' USING ERRCODE = '22023';
  END;

  SELECT id, incident_number INTO v_existing
    FROM public.safety_incidents
   WHERE reporter_id = v_uid AND client_submission_id = v_csid LIMIT 1;
  IF FOUND THEN
    RETURN jsonb_build_object('id', v_existing.id, 'incident_number', v_existing.incident_number, 'reused', true);
  END IF;

  v_bu := NULLIF(p_payload->>'business_unit_id', '')::uuid;
  v_dept := NULLIF(p_payload->>'department_id', '')::uuid;

  IF v_bu IS NOT NULL THEN
    SELECT * INTO v_route FROM public.resolve_safety_routing(v_bu, v_dept) LIMIT 1;
    IF FOUND THEN
      v_bu_head := v_route.bu_head;
      v_mgr := v_route.manager;
      v_mgr2 := v_route.second_manager;
      v_routing_status := v_route.source;
      v_initial_status := 'management_review';
    END IF;
  END IF;

  PERFORM set_config('safety.fsm_transition', 'on', true);
  INSERT INTO public.safety_incidents (
    reporter_id, client_submission_id, title, description, location,
    incident_type, severity, business_unit_id, department_id,
    involved_person_id, involved_person_name, occurred_at,
    routed_bu_head_id, routed_manager_id, routed_second_manager_id, routing_status,
    status
  ) VALUES (
    v_uid, v_csid,
    NULLIF(p_payload->>'title',''),
    NULLIF(p_payload->>'description',''),
    NULLIF(p_payload->>'location',''),
    (p_payload->>'incident_type')::safety_incident_type,
    (p_payload->>'severity')::safety_incident_severity,
    v_bu, v_dept,
    NULLIF(p_payload->>'involved_person_id','')::uuid,
    NULLIF(p_payload->>'involved_person_name',''),
    COALESCE(NULLIF(p_payload->>'occurred_at','')::timestamptz, now()),
    v_bu_head, v_mgr, v_mgr2, v_routing_status,
    v_initial_status
  ) RETURNING id, incident_number INTO v_new;
  PERFORM set_config('safety.fsm_transition', 'off', true);

  IF v_initial_status = 'management_review' THEN
    INSERT INTO public.safety_incident_timeline (incident_id, from_status, to_status, changed_by, notes)
    VALUES (v_new.id, 'reported', 'management_review', v_uid, 'Auto-routed to management review');
  END IF;

  RETURN jsonb_build_object('id', v_new.id, 'incident_number', v_new.incident_number, 'reused', false);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.report_safety_incident(jsonb) TO authenticated;

-- transition_safety_incident: new 9-stage order; verifier required for verification; safety_head stamping
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

  PERFORM set_config('safety.fsm_transition', 'on', true);

  UPDATE public.safety_incidents
     SET status        = p_to_status,
         assigned_to   = COALESCE(p_assigned_to, assigned_to),
         assigned_at   = CASE WHEN p_to_status = 'assigned' THEN now() ELSE assigned_at END,
         safety_head_id = CASE WHEN p_to_status = 'safety_head_review' THEN COALESCE(safety_head_id, v_user) ELSE safety_head_id END,
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
