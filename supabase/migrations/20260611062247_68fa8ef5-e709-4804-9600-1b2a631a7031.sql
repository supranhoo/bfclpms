
CREATE TABLE public.safety_incident_routing_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_unit_id uuid NOT NULL REFERENCES public.business_units(id) ON DELETE CASCADE,
  department_id uuid NULL REFERENCES public.departments(id) ON DELETE CASCADE,
  bu_head_id uuid NOT NULL REFERENCES public.profiles(id),
  manager_id uuid NOT NULL REFERENCES public.profiles(id),
  second_manager_id uuid NOT NULL REFERENCES public.profiles(id),
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid NULL REFERENCES public.profiles(id),
  updated_by uuid NULL REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX uq_safety_routing_active_dept
  ON public.safety_incident_routing_rules (business_unit_id, department_id)
  WHERE is_active AND department_id IS NOT NULL;
CREATE UNIQUE INDEX uq_safety_routing_active_bu_default
  ON public.safety_incident_routing_rules (business_unit_id)
  WHERE is_active AND department_id IS NULL;
CREATE INDEX ix_safety_routing_lookup
  ON public.safety_incident_routing_rules (business_unit_id, department_id, is_active);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.safety_incident_routing_rules TO authenticated;
GRANT ALL ON public.safety_incident_routing_rules TO service_role;
ALTER TABLE public.safety_incident_routing_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "safety_routing_read"
  ON public.safety_incident_routing_rules
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "safety_routing_admin_write"
  ON public.safety_incident_routing_rules
  FOR ALL TO authenticated
  USING (public.has_safety_role(auth.uid(), 'admin'::safety_app_role) OR public.has_safety_role(auth.uid(), 'safety_head'::safety_app_role))
  WITH CHECK (public.has_safety_role(auth.uid(), 'admin'::safety_app_role) OR public.has_safety_role(auth.uid(), 'safety_head'::safety_app_role));

CREATE TRIGGER trg_safety_routing_updated_at
  BEFORE UPDATE ON public.safety_incident_routing_rules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.safety_incidents
  ADD COLUMN routed_bu_head_id uuid NULL REFERENCES public.profiles(id),
  ADD COLUMN routed_manager_id uuid NULL REFERENCES public.profiles(id),
  ADD COLUMN routed_second_manager_id uuid NULL REFERENCES public.profiles(id),
  ADD COLUMN routing_status text NOT NULL DEFAULT 'unrouted'
    CHECK (routing_status IN ('dept','division','unrouted','legacy'));

UPDATE public.safety_incidents SET routing_status = 'legacy';

CREATE OR REPLACE FUNCTION public.resolve_safety_routing(p_bu uuid, p_dept uuid)
RETURNS TABLE(bu_head uuid, manager uuid, second_manager uuid, source text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  (SELECT bu_head_id, manager_id, second_manager_id, 'dept'::text
   FROM public.safety_incident_routing_rules
   WHERE is_active AND business_unit_id = p_bu AND department_id = p_dept LIMIT 1)
  UNION ALL
  (SELECT bu_head_id, manager_id, second_manager_id, 'division'::text
   FROM public.safety_incident_routing_rules
   WHERE is_active AND business_unit_id = p_bu AND department_id IS NULL LIMIT 1)
  LIMIT 1;
$$;
GRANT EXECUTE ON FUNCTION public.resolve_safety_routing(uuid, uuid) TO authenticated, service_role;

-- View: append new columns AFTER existing sla_state (CREATE OR REPLACE only allows appending)
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
       routed_bu_head_id, routed_manager_id, routed_second_manager_id, routing_status
FROM public.safety_incidents i;

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
    END IF;
  END IF;

  INSERT INTO public.safety_incidents (
    reporter_id, client_submission_id, title, description, location,
    incident_type, severity, business_unit_id, department_id,
    involved_person_id, involved_person_name, occurred_at,
    routed_bu_head_id, routed_manager_id, routed_second_manager_id, routing_status
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
    v_bu_head, v_mgr, v_mgr2, v_routing_status
  ) RETURNING id, incident_number INTO v_new;

  RETURN jsonb_build_object('id', v_new.id, 'incident_number', v_new.incident_number, 'reused', false);
END;
$function$;

CREATE OR REPLACE FUNCTION public.trg_safety_incident_after_insert()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  _r record;
  _routed uuid;
BEGIN
  FOR _r IN
    SELECT DISTINCT user_id FROM public.safety_user_roles
     WHERE role IN ('safety_head'::safety_app_role,'safety_officer'::safety_app_role,'admin'::safety_app_role)
  LOOP
    PERFORM public.enqueue_safety_notification(
      _r.user_id, NEW.id, 'incident_reported',
      'New incident reported: ' || COALESCE(NEW.incident_number,''),
      NEW.title,
      jsonb_build_object('severity', NEW.severity, 'type', NEW.incident_type, 'routing_status', NEW.routing_status)
    );
  END LOOP;

  FOREACH _routed IN ARRAY ARRAY[NEW.routed_bu_head_id, NEW.routed_manager_id, NEW.routed_second_manager_id]
  LOOP
    IF _routed IS NOT NULL THEN
      PERFORM public.enqueue_safety_notification(
        _routed, NEW.id, 'incident_reported',
        'Incident routed to you: ' || COALESCE(NEW.incident_number,''),
        NEW.title,
        jsonb_build_object('severity', NEW.severity, 'type', NEW.incident_type, 'routing_source', NEW.routing_status)
      );
    END IF;
  END LOOP;

  PERFORM public.enqueue_safety_notification(
    NEW.reporter_id, NEW.id, 'incident_reported',
    'Your incident was submitted: ' || COALESCE(NEW.incident_number,''),
    'We have logged your report. You will receive updates as it progresses.',
    jsonb_build_object('severity', NEW.severity)
  );

  RETURN NEW;
END;
$function$;

INSERT INTO public.safety_permission_keys (key, category, label, description)
VALUES ('action.routing.manage', 'action', 'Manage Incident Routing', 'Configure BU Head / Manager / 2nd Manager routing rules')
ON CONFLICT (key) DO NOTHING;
