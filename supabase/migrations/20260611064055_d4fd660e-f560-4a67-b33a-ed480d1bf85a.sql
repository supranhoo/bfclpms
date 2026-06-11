
-- 1. Priority enum + column
DO $$ BEGIN
  CREATE TYPE public.safety_priority AS ENUM ('low','medium','high','critical');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.safety_incidents
  ADD COLUMN IF NOT EXISTS priority public.safety_priority NOT NULL DEFAULT 'medium',
  ADD COLUMN IF NOT EXISTS sla_rule_id uuid,
  ADD COLUMN IF NOT EXISTS sla_start_at timestamptz,
  ADD COLUMN IF NOT EXISTS sla_due_at timestamptz,
  ADD COLUMN IF NOT EXISTS sla_target_hours integer,
  ADD COLUMN IF NOT EXISTS sla_amber_threshold_pct integer;

-- 2. Rule table
CREATE TABLE IF NOT EXISTS public.safety_incident_sla_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_type public.safety_incident_type NOT NULL,
  severity public.safety_incident_severity NOT NULL,
  priority public.safety_priority,        -- NULL = applies to any priority
  target_hours integer NOT NULL CHECK (target_hours > 0),
  amber_threshold_pct integer NOT NULL DEFAULT 50 CHECK (amber_threshold_pct BETWEEN 1 AND 99),
  is_active boolean NOT NULL DEFAULT true,
  notes text,
  created_by uuid REFERENCES public.profiles(id),
  updated_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.safety_incident_sla_rules TO authenticated;
GRANT ALL ON public.safety_incident_sla_rules TO service_role;

ALTER TABLE public.safety_incident_sla_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "safety_sla_rules_read"
  ON public.safety_incident_sla_rules FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "safety_sla_rules_admin_write"
  ON public.safety_incident_sla_rules FOR ALL
  TO authenticated
  USING (
    public.has_safety_role(auth.uid(), 'admin'::safety_app_role)
    OR public.has_safety_role(auth.uid(), 'safety_head'::safety_app_role)
  )
  WITH CHECK (
    public.has_safety_role(auth.uid(), 'admin'::safety_app_role)
    OR public.has_safety_role(auth.uid(), 'safety_head'::safety_app_role)
  );

-- Prevent duplicate active rules for the same (type, severity, priority) tuple
CREATE UNIQUE INDEX IF NOT EXISTS uq_safety_sla_rules_active_specific
  ON public.safety_incident_sla_rules (incident_type, severity, priority)
  WHERE is_active AND priority IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_safety_sla_rules_active_any_priority
  ON public.safety_incident_sla_rules (incident_type, severity)
  WHERE is_active AND priority IS NULL;

-- Updated-at trigger
CREATE OR REPLACE FUNCTION public.tg_safety_sla_rules_touch()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_safety_sla_rules_touch ON public.safety_incident_sla_rules;
CREATE TRIGGER trg_safety_sla_rules_touch
  BEFORE UPDATE ON public.safety_incident_sla_rules
  FOR EACH ROW EXECUTE FUNCTION public.tg_safety_sla_rules_touch();

-- 3. Resolver
CREATE OR REPLACE FUNCTION public.resolve_safety_incident_sla(
  p_type     public.safety_incident_type,
  p_severity public.safety_incident_severity,
  p_priority public.safety_priority
)
RETURNS TABLE(rule_id uuid, target_hours int, amber_threshold_pct int)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT id, target_hours, amber_threshold_pct
    FROM public.safety_incident_sla_rules
   WHERE is_active
     AND incident_type = p_type
     AND severity      = p_severity
     AND (priority = p_priority OR priority IS NULL)
   ORDER BY (priority IS NULL) ASC   -- prefer specific priority match over NULL
   LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.resolve_safety_incident_sla(public.safety_incident_type, public.safety_incident_severity, public.safety_priority) TO authenticated, service_role;

-- 4. Seed defaults (only if table is empty — won't overwrite admin config)
INSERT INTO public.safety_incident_sla_rules (incident_type, severity, priority, target_hours, notes)
SELECT t, s, NULL::public.safety_priority, h, 'Seed default'
FROM (VALUES
  ('near_miss'::public.safety_incident_type,        'low'::public.safety_incident_severity,      14*24),
  ('near_miss',        'medium',    7*24),
  ('near_miss',        'high',      3*24),
  ('near_miss',        'critical',  1*24),
  ('unsafe_act',       'low',       21*24),
  ('unsafe_act',       'medium',    10*24),
  ('unsafe_act',       'high',      5*24),
  ('unsafe_act',       'critical',  2*24),
  ('unsafe_condition', 'low',       30*24),
  ('unsafe_condition', 'medium',    14*24),
  ('unsafe_condition', 'high',      7*24),
  ('unsafe_condition', 'critical',  3*24),
  ('accident',         'low',       14*24),
  ('accident',         'medium',    7*24),
  ('accident',         'high',      2*24),
  ('accident',         'critical',  1*24),
  ('property_damage',  'low',       30*24),
  ('property_damage',  'medium',    14*24),
  ('property_damage',  'high',      5*24),
  ('property_damage',  'critical',  2*24),
  ('environmental',    'low',       30*24),
  ('environmental',    'medium',    14*24),
  ('environmental',    'high',      5*24),
  ('environmental',    'critical',  1*24)
) AS v(t, s, h)
WHERE NOT EXISTS (SELECT 1 FROM public.safety_incident_sla_rules);

-- 5. Refresh report_safety_incident to stamp SLA fields
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

-- 6. View refresh — adds SLA cols + computed sla_status (historical-safe: based on stored sla_due_at)
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
         WHEN sla_due_at IS NOT NULL AND now() > sla_due_at THEN 'red'
         WHEN sla_due_at IS NOT NULL
              AND now() > (sla_start_at + (sla_due_at - sla_start_at) * (COALESCE(sla_amber_threshold_pct, 50)::numeric / 100))
              THEN 'amber'
         WHEN sla_due_at IS NULL AND now() > close_due_at THEN 'red'
         WHEN sla_due_at IS NULL AND now() > (close_due_at - (close_due_at - created_at) * 0.25) THEN 'amber'
         ELSE 'green'
       END AS sla_state,
       routed_bu_head_id, routed_manager_id, routed_second_manager_id, routing_status,
       safety_head_id, verifier_id,
       priority,
       sla_rule_id, sla_start_at, sla_due_at, sla_target_hours, sla_amber_threshold_pct,
       CASE
         WHEN status = 'closed'::safety_incident_status AND closed_at IS NOT NULL AND sla_due_at IS NOT NULL
              AND closed_at <= sla_due_at THEN 'closed_on_time'
         WHEN status = 'closed'::safety_incident_status AND closed_at IS NOT NULL AND sla_due_at IS NOT NULL
              AND closed_at >  sla_due_at THEN 'closed_late'
         WHEN status = 'closed'::safety_incident_status THEN 'closed_on_time'
         WHEN sla_due_at IS NOT NULL AND now() > sla_due_at THEN 'overdue'
         WHEN sla_due_at IS NOT NULL
              AND now() > (sla_start_at + (sla_due_at - sla_start_at) * (COALESCE(sla_amber_threshold_pct, 50)::numeric / 100))
              THEN 'at_risk'
         ELSE 'on_track'
       END AS sla_status
FROM public.safety_incidents i;

GRANT SELECT ON public.safety_incidents_with_sla TO authenticated;
