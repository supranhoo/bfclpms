
ALTER TABLE public.safety_incident_routing_rules
  ADD COLUMN IF NOT EXISTS safety_head_id uuid NULL REFERENCES public.profiles(id);

DROP FUNCTION IF EXISTS public.resolve_safety_routing(uuid, uuid);

CREATE OR REPLACE FUNCTION public.resolve_safety_routing(p_bu uuid, p_dept uuid)
RETURNS TABLE(bu_head uuid, manager uuid, second_manager uuid, safety_head uuid, source text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  (SELECT bu_head_id, manager_id, second_manager_id, safety_head_id, 'dept'::text
   FROM public.safety_incident_routing_rules
   WHERE is_active AND business_unit_id = p_bu AND department_id = p_dept LIMIT 1)
  UNION ALL
  (SELECT bu_head_id, manager_id, second_manager_id, safety_head_id, 'division'::text
   FROM public.safety_incident_routing_rules
   WHERE is_active AND business_unit_id = p_bu AND department_id IS NULL LIMIT 1)
  LIMIT 1;
$$;
GRANT EXECUTE ON FUNCTION public.resolve_safety_routing(uuid, uuid) TO authenticated, service_role;

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
  v_safety_head uuid;
  v_initial_status public.safety_incident_status := 'reported';
  v_type public.safety_incident_type;
  v_sev  public.safety_incident_severity;
  v_pri  public.safety_priority;
  v_sla  record;
  v_sla_start timestamptz := now();
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

  v_bu   := NULLIF(p_payload->>'business_unit_id', '')::uuid;
  v_dept := NULLIF(p_payload->>'department_id', '')::uuid;
  v_type := (p_payload->>'incident_type')::public.safety_incident_type;
  v_sev  := (p_payload->>'severity')::public.safety_incident_severity;
  v_pri  := COALESCE(NULLIF(p_payload->>'priority','')::public.safety_priority, 'medium'::public.safety_priority);

  IF v_bu IS NOT NULL THEN
    SELECT * INTO v_route FROM public.resolve_safety_routing(v_bu, v_dept) LIMIT 1;
    IF FOUND THEN
      v_bu_head := v_route.bu_head;
      v_mgr     := v_route.manager;
      v_mgr2    := v_route.second_manager;
      v_safety_head := v_route.safety_head;
      v_routing_status := v_route.source;
      v_initial_status := 'management_review';
    END IF;
  END IF;

  SELECT * INTO v_sla FROM public.resolve_safety_incident_sla(v_type, v_sev, v_pri) LIMIT 1;

  PERFORM set_config('safety.fsm_transition', 'on', true);
  INSERT INTO public.safety_incidents (
    reporter_id, client_submission_id, title, description, location,
    incident_type, severity, priority, business_unit_id, department_id,
    involved_person_id, involved_person_name, occurred_at,
    routed_bu_head_id, routed_manager_id, routed_second_manager_id, routing_status,
    safety_head_id,
    status,
    sla_rule_id, sla_start_at, sla_due_at, sla_target_hours, sla_amber_threshold_pct
  ) VALUES (
    v_uid, v_csid,
    NULLIF(p_payload->>'title',''),
    NULLIF(p_payload->>'description',''),
    NULLIF(p_payload->>'location',''),
    v_type, v_sev, v_pri,
    v_bu, v_dept,
    NULLIF(p_payload->>'involved_person_id','')::uuid,
    NULLIF(p_payload->>'involved_person_name',''),
    COALESCE(NULLIF(p_payload->>'occurred_at','')::timestamptz, now()),
    v_bu_head, v_mgr, v_mgr2, v_routing_status,
    v_safety_head,
    v_initial_status,
    v_sla.rule_id,
    v_sla_start,
    CASE WHEN v_sla.target_hours IS NOT NULL THEN v_sla_start + make_interval(hours => v_sla.target_hours) END,
    v_sla.target_hours,
    COALESCE(v_sla.amber_threshold_pct, 50)
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

CREATE OR REPLACE FUNCTION public.has_responsible_safety_role(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    EXISTS (
      SELECT 1 FROM public.safety_user_roles
      WHERE user_id = _user_id AND role <> 'worker'
    )
    OR EXISTS (
      SELECT 1
      FROM public.iac_user_role_assignments ura
      JOIN public.iac_roles r ON r.id = ura.role_id
      WHERE ura.user_id = _user_id
        AND r.is_active = true
        AND r.module = 'safety'
        AND r.code <> 'safety_worker'
        AND (ura.expires_at IS NULL OR ura.expires_at > now())
    )
    OR EXISTS (
      SELECT 1 FROM public.safety_incident_routing_rules rr
      WHERE rr.is_active = true
        AND (rr.bu_head_id = _user_id
          OR rr.manager_id = _user_id
          OR rr.second_manager_id = _user_id
          OR rr.safety_head_id = _user_id)
    )
    OR EXISTS (
      SELECT 1 FROM public.safety_incidents i
      WHERE i.assigned_to = _user_id
        OR i.routed_bu_head_id = _user_id
        OR i.routed_manager_id = _user_id
        OR i.routed_second_manager_id = _user_id
        OR i.safety_head_id = _user_id
        OR i.verifier_id = _user_id
    );
$function$;
