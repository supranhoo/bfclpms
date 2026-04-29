
-- ============================================================
-- Phase 1.B — Safety Incident Schema, FSM guards, SLA, evidence
-- (sla_state via view, not generated column)
-- ============================================================

CREATE TYPE public.safety_incident_status AS ENUM (
  'reported','assigned','investigation','rca','corrective_action','verification','closed','orphaned'
);

CREATE TYPE public.safety_incident_severity AS ENUM (
  'low','medium','high','critical'
);

CREATE TYPE public.safety_incident_type AS ENUM (
  'near_miss','unsafe_act','unsafe_condition','accident','property_damage','environmental'
);

CREATE TYPE public.safety_evidence_stage AS ENUM (
  'report','assignment','investigation','rca','capa','verification'
);

CREATE TABLE public.safety_severity_sla (
  severity public.safety_incident_severity PRIMARY KEY,
  acknowledge_hours integer NOT NULL,
  close_hours integer NOT NULL,
  amber_threshold_pct integer NOT NULL DEFAULT 75,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.safety_severity_sla ENABLE ROW LEVEL SECURITY;

INSERT INTO public.safety_severity_sla (severity, acknowledge_hours, close_hours) VALUES
  ('low', 48, 720),
  ('medium', 24, 336),
  ('high', 8, 168),
  ('critical', 2, 72);

CREATE POLICY "Safety users can read SLA matrix"
  ON public.safety_severity_sla FOR SELECT
  USING (public.has_safety_module_access(auth.uid()));

CREATE POLICY "Safety admins can manage SLA matrix"
  ON public.safety_severity_sla FOR ALL
  USING (public.has_safety_role(auth.uid(), 'admin'::public.safety_app_role))
  WITH CHECK (public.has_safety_role(auth.uid(), 'admin'::public.safety_app_role));

CREATE SEQUENCE public.safety_incident_number_seq START 1000;

CREATE TABLE public.safety_incidents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_number text UNIQUE,
  client_submission_id uuid NOT NULL DEFAULT gen_random_uuid(),
  reporter_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  business_unit_id uuid REFERENCES public.business_units(id) ON DELETE SET NULL,
  department_id uuid REFERENCES public.departments(id) ON DELETE SET NULL,
  incident_type public.safety_incident_type NOT NULL,
  severity public.safety_incident_severity NOT NULL,
  status public.safety_incident_status NOT NULL DEFAULT 'reported',
  title text NOT NULL,
  description text NOT NULL,
  location text NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  involved_person_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  involved_person_name text,
  assigned_to uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  assigned_at timestamptz,
  acknowledge_due_at timestamptz NOT NULL,
  close_due_at timestamptz NOT NULL,
  closed_at timestamptz,
  closed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  rca_summary text,
  capa_summary text,
  verification_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_safety_incident_client UNIQUE (reporter_id, client_submission_id)
);

CREATE INDEX idx_safety_incidents_status ON public.safety_incidents(status);
CREATE INDEX idx_safety_incidents_reporter ON public.safety_incidents(reporter_id);
CREATE INDEX idx_safety_incidents_assigned ON public.safety_incidents(assigned_to);
CREATE INDEX idx_safety_incidents_bu ON public.safety_incidents(business_unit_id);
CREATE INDEX idx_safety_incidents_close_due ON public.safety_incidents(close_due_at);

-- View exposing live sla_state
CREATE OR REPLACE VIEW public.safety_incidents_with_sla AS
SELECT
  i.*,
  CASE
    WHEN i.status = 'closed' THEN 'closed'
    WHEN now() > i.close_due_at THEN 'red'
    WHEN now() > (i.close_due_at - ((i.close_due_at - i.created_at) * 0.25)) THEN 'amber'
    ELSE 'green'
  END AS sla_state
FROM public.safety_incidents i;

-- View inherits caller permissions; explicitly grant
GRANT SELECT ON public.safety_incidents_with_sla TO authenticated;

CREATE TABLE public.safety_incident_timeline (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id uuid NOT NULL REFERENCES public.safety_incidents(id) ON DELETE CASCADE,
  from_status public.safety_incident_status,
  to_status public.safety_incident_status NOT NULL,
  changed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_safety_timeline_incident ON public.safety_incident_timeline(incident_id, created_at);

CREATE TABLE public.safety_incident_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id uuid NOT NULL REFERENCES public.safety_incidents(id) ON DELETE CASCADE,
  stage public.safety_evidence_stage NOT NULL,
  file_path text NOT NULL,
  file_name text NOT NULL,
  mime_type text,
  size_bytes bigint,
  uploaded_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  uploaded_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_safety_evidence_incident_stage ON public.safety_incident_evidence(incident_id, stage);

CREATE TABLE public.safety_incident_progress_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id uuid NOT NULL REFERENCES public.safety_incidents(id) ON DELETE CASCADE,
  stage public.safety_incident_status NOT NULL,
  note text NOT NULL,
  logged_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_safety_progress_incident ON public.safety_incident_progress_logs(incident_id, created_at);

-- BEFORE INSERT: incident_number + SLA deadlines
CREATE OR REPLACE FUNCTION public.safety_incident_before_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ack int;
  v_close int;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('safety_incident_number'));
  IF NEW.incident_number IS NULL THEN
    NEW.incident_number := 'INC-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('public.safety_incident_number_seq')::text, 6, '0');
  END IF;

  SELECT acknowledge_hours, close_hours INTO v_ack, v_close
    FROM public.safety_severity_sla WHERE severity = NEW.severity;

  IF NEW.acknowledge_due_at IS NULL THEN
    NEW.acknowledge_due_at := COALESCE(NEW.created_at, now()) + (v_ack || ' hours')::interval;
  END IF;
  IF NEW.close_due_at IS NULL THEN
    NEW.close_due_at := COALESCE(NEW.created_at, now()) + (v_close || ' hours')::interval;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_safety_incident_before_insert
  BEFORE INSERT ON public.safety_incidents
  FOR EACH ROW EXECUTE FUNCTION public.safety_incident_before_insert();

-- FSM guard
CREATE OR REPLACE FUNCTION public.safety_incident_fsm_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF current_setting('safety.fsm_transition', true) IS DISTINCT FROM 'on' THEN
      RAISE EXCEPTION 'Direct status update blocked. Use transition_safety_incident() RPC.'
        USING ERRCODE = '42501';
    END IF;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_safety_incident_fsm_guard
  BEFORE UPDATE ON public.safety_incidents
  FOR EACH ROW EXECUTE FUNCTION public.safety_incident_fsm_guard();

-- RPC
CREATE OR REPLACE FUNCTION public.transition_safety_incident(
  p_incident_id uuid,
  p_to_status public.safety_incident_status,
  p_notes text DEFAULT NULL,
  p_assigned_to uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_curr public.safety_incident_status;
  v_order int;
  v_next_order int;
  v_evidence_count int;
  v_progress_count int;
  v_inc record;
BEGIN
  IF v_user IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unauthenticated');
  END IF;

  SELECT * INTO v_inc FROM public.safety_incidents WHERE id = p_incident_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'incident not found');
  END IF;

  v_curr := v_inc.status;

  v_order := array_position(
    ARRAY['reported','assigned','investigation','rca','corrective_action','verification','closed']::public.safety_incident_status[],
    v_curr
  );
  v_next_order := array_position(
    ARRAY['reported','assigned','investigation','rca','corrective_action','verification','closed']::public.safety_incident_status[],
    p_to_status
  );

  IF p_to_status = 'orphaned' THEN
    NULL;
  ELSIF v_next_order IS NULL OR v_order IS NULL OR v_next_order <> v_order + 1 THEN
    RETURN jsonb_build_object('ok', false, 'error', format('illegal transition: %s -> %s', v_curr, p_to_status));
  END IF;

  IF p_to_status = 'assigned' THEN
    IF p_assigned_to IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'error', 'assigned_to required');
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
     SET status = p_to_status,
         assigned_to = COALESCE(p_assigned_to, assigned_to),
         assigned_at = CASE WHEN p_to_status = 'assigned' THEN now() ELSE assigned_at END,
         closed_at = CASE WHEN p_to_status = 'closed' THEN now() ELSE closed_at END,
         closed_by = CASE WHEN p_to_status = 'closed' THEN v_user ELSE closed_by END
   WHERE id = p_incident_id;

  PERFORM set_config('safety.fsm_transition', 'off', true);

  INSERT INTO public.safety_incident_timeline (incident_id, from_status, to_status, changed_by, notes)
  VALUES (p_incident_id, v_curr, p_to_status, v_user, p_notes);

  RETURN jsonb_build_object('ok', true, 'from', v_curr, 'to', p_to_status);
END;
$$;

GRANT EXECUTE ON FUNCTION public.transition_safety_incident(uuid, public.safety_incident_status, text, uuid) TO authenticated;

CREATE TRIGGER trg_safety_sla_updated
  BEFORE UPDATE ON public.safety_severity_sla
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.safety_incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.safety_incident_timeline ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.safety_incident_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.safety_incident_progress_logs ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.can_view_safety_incident(_incident_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.safety_incidents i
    WHERE i.id = _incident_id
      AND (
        i.reporter_id = auth.uid()
        OR i.assigned_to = auth.uid()
        OR public.has_safety_role(auth.uid(), 'admin'::public.safety_app_role)
        OR public.has_safety_role(auth.uid(), 'safety_head'::public.safety_app_role)
        OR public.has_safety_role(auth.uid(), 'safety_officer'::public.safety_app_role)
        OR public.has_safety_role(auth.uid(), 'auditor'::public.safety_app_role)
        OR EXISTS (
          SELECT 1 FROM public.safety_user_roles r
          WHERE r.user_id = auth.uid()
            AND r.role = 'bu_head'::public.safety_app_role
            AND (r.business_unit_id IS NULL OR r.business_unit_id = i.business_unit_id)
        )
      )
  )
$$;

GRANT EXECUTE ON FUNCTION public.can_view_safety_incident(uuid) TO authenticated;

CREATE POLICY "Safety users can view incidents in scope"
  ON public.safety_incidents FOR SELECT
  USING (public.can_view_safety_incident(id));

CREATE POLICY "Safety users can report incidents"
  ON public.safety_incidents FOR INSERT
  WITH CHECK (
    public.has_safety_module_access(auth.uid())
    AND reporter_id = auth.uid()
  );

CREATE POLICY "Safety officers/admins update incident metadata"
  ON public.safety_incidents FOR UPDATE
  USING (
    public.has_safety_role(auth.uid(), 'admin'::public.safety_app_role)
    OR public.has_safety_role(auth.uid(), 'safety_head'::public.safety_app_role)
    OR public.has_safety_role(auth.uid(), 'safety_officer'::public.safety_app_role)
    OR assigned_to = auth.uid()
  )
  WITH CHECK (
    public.has_safety_role(auth.uid(), 'admin'::public.safety_app_role)
    OR public.has_safety_role(auth.uid(), 'safety_head'::public.safety_app_role)
    OR public.has_safety_role(auth.uid(), 'safety_officer'::public.safety_app_role)
    OR assigned_to = auth.uid()
  );

CREATE POLICY "Safety admins delete incidents"
  ON public.safety_incidents FOR DELETE
  USING (public.has_safety_role(auth.uid(), 'admin'::public.safety_app_role));

CREATE POLICY "View timeline for visible incidents"
  ON public.safety_incident_timeline FOR SELECT
  USING (public.can_view_safety_incident(incident_id));

CREATE POLICY "View evidence for visible incidents"
  ON public.safety_incident_evidence FOR SELECT
  USING (public.can_view_safety_incident(incident_id));

CREATE POLICY "Upload evidence on visible incidents"
  ON public.safety_incident_evidence FOR INSERT
  WITH CHECK (
    public.can_view_safety_incident(incident_id)
    AND uploaded_by = auth.uid()
  );

CREATE POLICY "Delete own evidence or admin"
  ON public.safety_incident_evidence FOR DELETE
  USING (
    uploaded_by = auth.uid()
    OR public.has_safety_role(auth.uid(), 'admin'::public.safety_app_role)
  );

CREATE POLICY "View progress for visible incidents"
  ON public.safety_incident_progress_logs FOR SELECT
  USING (public.can_view_safety_incident(incident_id));

CREATE POLICY "Log progress on visible incidents"
  ON public.safety_incident_progress_logs FOR INSERT
  WITH CHECK (
    public.can_view_safety_incident(incident_id)
    AND logged_by = auth.uid()
  );

ALTER TABLE public.safety_incidents REPLICA IDENTITY FULL;
ALTER TABLE public.safety_incident_timeline REPLICA IDENTITY FULL;
ALTER TABLE public.safety_incident_evidence REPLICA IDENTITY FULL;
ALTER TABLE public.safety_incident_progress_logs REPLICA IDENTITY FULL;

ALTER PUBLICATION supabase_realtime ADD TABLE public.safety_incidents;
ALTER PUBLICATION supabase_realtime ADD TABLE public.safety_incident_timeline;
ALTER PUBLICATION supabase_realtime ADD TABLE public.safety_incident_evidence;
ALTER PUBLICATION supabase_realtime ADD TABLE public.safety_incident_progress_logs;

INSERT INTO storage.buckets (id, name, public)
VALUES ('safety-media', 'safety-media', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Safety users can upload to own folder"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'safety-media'
    AND auth.uid()::text = (storage.foldername(name))[1]
    AND public.has_safety_module_access(auth.uid())
  );

CREATE POLICY "Safety users read own folder; officers/admins read all"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'safety-media'
    AND (
      auth.uid()::text = (storage.foldername(name))[1]
      OR public.has_safety_role(auth.uid(), 'admin'::public.safety_app_role)
      OR public.has_safety_role(auth.uid(), 'safety_head'::public.safety_app_role)
      OR public.has_safety_role(auth.uid(), 'safety_officer'::public.safety_app_role)
      OR public.has_safety_role(auth.uid(), 'auditor'::public.safety_app_role)
    )
  );

CREATE POLICY "Safety admins delete media"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'safety-media'
    AND (
      auth.uid()::text = (storage.foldername(name))[1]
      OR public.has_safety_role(auth.uid(), 'admin'::public.safety_app_role)
    )
  );
