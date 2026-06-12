
-- Phase 1: Actual Reporter (file-on-behalf-of)
ALTER TABLE public.safety_incidents
  ADD COLUMN IF NOT EXISTS actual_reporter_id uuid REFERENCES public.profiles(id);

CREATE INDEX IF NOT EXISTS idx_safety_incidents_actual_reporter
  ON public.safety_incidents(actual_reporter_id);

COMMENT ON COLUMN public.safety_incidents.actual_reporter_id IS
  'Optional employee on whose behalf the incident was filed. Display/audit only — does not grant any access.';

-- Replace report RPC to accept optional actual_reporter_id.
CREATE OR REPLACE FUNCTION public.report_safety_incident(p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
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
  v_type_id uuid;
  v_severity_id uuid;
  v_type_code text;
  v_severity_code text;
  v_type_label text;
  v_severity_label text;
  v_type_enum public.safety_incident_type;
  v_sev_enum  public.safety_incident_severity;
  v_pri  public.safety_priority;
  v_sla  record;
  v_sla_start timestamptz := now();
  v_actual_reporter_id uuid;
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
  v_type_id := NULLIF(p_payload->>'incident_type_id','')::uuid;
  v_severity_id := NULLIF(p_payload->>'severity_id','')::uuid;
  v_pri  := COALESCE(NULLIF(p_payload->>'priority','')::public.safety_priority, 'medium'::public.safety_priority);

  -- Optional actual reporter (file-on-behalf-of). Must reference an active profile.
  v_actual_reporter_id := NULLIF(p_payload->>'actual_reporter_id','')::uuid;
  IF v_actual_reporter_id IS NOT NULL THEN
    PERFORM 1 FROM public.profiles WHERE id = v_actual_reporter_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'actual_reporter_not_found' USING ERRCODE = '22023';
    END IF;
  END IF;

  IF v_type_id IS NOT NULL THEN
    SELECT code, name INTO v_type_code, v_type_label
      FROM public.safety_incident_types WHERE id = v_type_id AND is_active LIMIT 1;
    IF v_type_code IS NULL THEN
      RAISE EXCEPTION 'incident_type_not_found' USING ERRCODE = '22023';
    END IF;
  ELSE
    v_type_code := NULLIF(p_payload->>'incident_type','');
    IF v_type_code IS NULL THEN
      RAISE EXCEPTION 'incident_type_required' USING ERRCODE = '22023';
    END IF;
    SELECT id, name INTO v_type_id, v_type_label
      FROM public.safety_incident_types WHERE code = v_type_code LIMIT 1;
  END IF;

  IF v_severity_id IS NOT NULL THEN
    SELECT code, label INTO v_severity_code, v_severity_label
      FROM public.safety_incident_severities
     WHERE id = v_severity_id AND incident_type_id = v_type_id AND is_active LIMIT 1;
    IF v_severity_code IS NULL THEN
      RAISE EXCEPTION 'severity_not_in_type' USING ERRCODE = '22023';
    END IF;
  ELSE
    v_severity_code := NULLIF(p_payload->>'severity','');
    IF v_severity_code IS NULL THEN
      RAISE EXCEPTION 'severity_required' USING ERRCODE = '22023';
    END IF;
    SELECT id, label INTO v_severity_id, v_severity_label
      FROM public.safety_incident_severities
     WHERE incident_type_id = v_type_id AND code = v_severity_code LIMIT 1;
  END IF;

  BEGIN v_type_enum := v_type_code::public.safety_incident_type;
  EXCEPTION WHEN OTHERS THEN v_type_enum := 'near_miss'::public.safety_incident_type; END;
  BEGIN v_sev_enum := v_severity_code::public.safety_incident_severity;
  EXCEPTION WHEN OTHERS THEN v_sev_enum := 'medium'::public.safety_incident_severity; END;

  IF v_bu IS NOT NULL THEN
    SELECT * INTO v_route FROM public.resolve_safety_routing(v_bu, v_dept) LIMIT 1;
    IF FOUND THEN
      v_bu_head := v_route.bu_head;
      v_mgr     := v_route.manager;
      v_mgr2    := v_route.second_manager;
      v_routing_status := v_route.source;
      v_initial_status := 'management_review';
    END IF;
  END IF;

  v_safety_head := public.resolve_global_safety_head();

  SELECT id AS rule_id, target_hours, amber_threshold_pct INTO v_sla
    FROM public.safety_incident_sla_rules
   WHERE is_active AND severity_id = v_severity_id
     AND (priority = v_pri OR priority IS NULL)
   ORDER BY (priority IS NULL) ASC LIMIT 1;
  IF v_sla.rule_id IS NULL THEN
    SELECT * INTO v_sla FROM public.resolve_safety_incident_sla(v_type_enum, v_sev_enum, v_pri) LIMIT 1;
  END IF;

  PERFORM set_config('safety.fsm_transition', 'on', true);
  INSERT INTO public.safety_incidents (
    reporter_id, client_submission_id, title, description, location,
    incident_type, severity, priority,
    incident_type_id, severity_id, type_label_snapshot, severity_label_snapshot,
    business_unit_id, department_id,
    involved_person_id, involved_person_name, occurred_at,
    routed_bu_head_id, routed_manager_id, routed_second_manager_id, routing_status,
    safety_head_id,
    status,
    sla_rule_id, sla_start_at, sla_due_at, sla_target_hours, sla_amber_threshold_pct,
    actual_reporter_id
  ) VALUES (
    v_uid, v_csid,
    NULLIF(p_payload->>'title',''),
    NULLIF(p_payload->>'description',''),
    NULLIF(p_payload->>'location',''),
    v_type_enum, v_sev_enum, v_pri,
    v_type_id, v_severity_id, v_type_label, v_severity_label,
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
    COALESCE(v_sla.amber_threshold_pct, 50),
    v_actual_reporter_id
  ) RETURNING id, incident_number INTO v_new;
  PERFORM set_config('safety.fsm_transition', 'off', true);

  IF v_initial_status = 'management_review' THEN
    INSERT INTO public.safety_incident_timeline (incident_id, from_status, to_status, changed_by, notes)
    VALUES (v_new.id, 'reported', 'management_review', v_uid, 'Auto-routed to management review');
  END IF;

  RETURN jsonb_build_object('id', v_new.id, 'incident_number', v_new.incident_number, 'reused', false);
END;
$function$;
