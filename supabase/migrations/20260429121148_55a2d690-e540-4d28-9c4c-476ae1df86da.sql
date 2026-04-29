-- Safety Phase 5 — Audit & Compliance Checklists

DO $$ BEGIN
  CREATE TYPE public.safety_audit_run_status  AS ENUM ('draft','submitted','reviewed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.safety_audit_answer AS ENUM ('yes','no','na');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.safety_audit_templates (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code        text NOT NULL UNIQUE,
  title       text NOT NULL,
  description text,
  category    text NOT NULL DEFAULT 'general',
  version     integer NOT NULL DEFAULT 1,
  is_active   boolean NOT NULL DEFAULT true,
  created_by  uuid,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_safety_audit_templates_active ON public.safety_audit_templates(is_active);

CREATE OR REPLACE FUNCTION public.safety_audit_templates_touch()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END $$;
DROP TRIGGER IF EXISTS trg_safety_audit_templates_touch ON public.safety_audit_templates;
CREATE TRIGGER trg_safety_audit_templates_touch
BEFORE UPDATE ON public.safety_audit_templates
FOR EACH ROW EXECUTE FUNCTION public.safety_audit_templates_touch();

CREATE TABLE IF NOT EXISTS public.safety_audit_template_items (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id       uuid NOT NULL REFERENCES public.safety_audit_templates(id) ON DELETE CASCADE,
  section           text NOT NULL DEFAULT 'General',
  prompt            text NOT NULL,
  weight            numeric NOT NULL DEFAULT 1 CHECK (weight > 0 AND weight <= 100),
  is_critical       boolean NOT NULL DEFAULT false,
  evidence_required boolean NOT NULL DEFAULT false,
  sort_order        integer NOT NULL DEFAULT 0,
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_safety_audit_items_tpl ON public.safety_audit_template_items(template_id, sort_order);

CREATE TABLE IF NOT EXISTS public.safety_audit_runs (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id       uuid NOT NULL REFERENCES public.safety_audit_templates(id) ON DELETE RESTRICT,
  business_unit_id  uuid,
  department_id     uuid,
  location          text,
  conducted_by      uuid,
  conducted_at      timestamptz NOT NULL DEFAULT now(),
  status            public.safety_audit_run_status NOT NULL DEFAULT 'draft',
  score             numeric,
  critical_failures integer NOT NULL DEFAULT 0,
  reviewed_by       uuid,
  reviewed_at       timestamptz,
  summary           text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_safety_audit_runs_status ON public.safety_audit_runs(status);
CREATE INDEX IF NOT EXISTS idx_safety_audit_runs_bu ON public.safety_audit_runs(business_unit_id);
CREATE INDEX IF NOT EXISTS idx_safety_audit_runs_tpl ON public.safety_audit_runs(template_id, conducted_at DESC);

CREATE OR REPLACE FUNCTION public.safety_audit_runs_touch()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END $$;
DROP TRIGGER IF EXISTS trg_safety_audit_runs_touch ON public.safety_audit_runs;
CREATE TRIGGER trg_safety_audit_runs_touch
BEFORE UPDATE ON public.safety_audit_runs
FOR EACH ROW EXECUTE FUNCTION public.safety_audit_runs_touch();

-- Block direct status writes; only RPCs may transition.
CREATE OR REPLACE FUNCTION public.safety_audit_runs_block_status_writes()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF current_setting('safety.audit_fsm', true) = 'true' THEN
    RETURN NEW;
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'safety_audit_runs.status is RPC-only (use submit_audit_run / mark_audit_reviewed)';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_safety_audit_runs_block_status ON public.safety_audit_runs;
CREATE TRIGGER trg_safety_audit_runs_block_status
BEFORE UPDATE ON public.safety_audit_runs
FOR EACH ROW EXECUTE FUNCTION public.safety_audit_runs_block_status_writes();

CREATE TABLE IF NOT EXISTS public.safety_audit_run_responses (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id            uuid NOT NULL REFERENCES public.safety_audit_runs(id) ON DELETE CASCADE,
  item_id           uuid NOT NULL REFERENCES public.safety_audit_template_items(id) ON DELETE RESTRICT,
  answer            public.safety_audit_answer NOT NULL,
  score             numeric NOT NULL DEFAULT 0,
  notes             text,
  evidence_path     text,
  auto_incident_id  uuid REFERENCES public.safety_incidents(id) ON DELETE SET NULL,
  created_by        uuid,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (run_id, item_id)
);
CREATE INDEX IF NOT EXISTS idx_safety_audit_resp_run ON public.safety_audit_run_responses(run_id);

ALTER TABLE public.safety_audit_templates       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.safety_audit_template_items  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.safety_audit_runs            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.safety_audit_run_responses   ENABLE ROW LEVEL SECURITY;

-- Templates: read for all authenticated safety roles; write admin/safety_head/safety_officer.
DROP POLICY IF EXISTS p_audit_tpl_read ON public.safety_audit_templates;
CREATE POLICY p_audit_tpl_read ON public.safety_audit_templates
FOR SELECT TO authenticated
USING (
     public.has_safety_role(auth.uid(),'admin',NULL)
  OR public.has_safety_role(auth.uid(),'safety_head',NULL)
  OR public.has_safety_role(auth.uid(),'safety_officer',NULL)
  OR public.has_safety_role(auth.uid(),'auditor',NULL)
  OR public.has_safety_role(auth.uid(),'manager',NULL)
  OR public.has_safety_role(auth.uid(),'bu_head',NULL)
  OR public.has_safety_role(auth.uid(),'supervisor',NULL)
);
DROP POLICY IF EXISTS p_audit_tpl_write ON public.safety_audit_templates;
CREATE POLICY p_audit_tpl_write ON public.safety_audit_templates
FOR ALL TO authenticated
USING (
     public.has_safety_role(auth.uid(),'admin',NULL)
  OR public.has_safety_role(auth.uid(),'safety_head',NULL)
  OR public.has_safety_role(auth.uid(),'safety_officer',NULL)
)
WITH CHECK (
     public.has_safety_role(auth.uid(),'admin',NULL)
  OR public.has_safety_role(auth.uid(),'safety_head',NULL)
  OR public.has_safety_role(auth.uid(),'safety_officer',NULL)
);

DROP POLICY IF EXISTS p_audit_items_read ON public.safety_audit_template_items;
CREATE POLICY p_audit_items_read ON public.safety_audit_template_items
FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.safety_audit_templates t WHERE t.id = template_id));
DROP POLICY IF EXISTS p_audit_items_write ON public.safety_audit_template_items;
CREATE POLICY p_audit_items_write ON public.safety_audit_template_items
FOR ALL TO authenticated
USING (
     public.has_safety_role(auth.uid(),'admin',NULL)
  OR public.has_safety_role(auth.uid(),'safety_head',NULL)
  OR public.has_safety_role(auth.uid(),'safety_officer',NULL)
)
WITH CHECK (
     public.has_safety_role(auth.uid(),'admin',NULL)
  OR public.has_safety_role(auth.uid(),'safety_head',NULL)
  OR public.has_safety_role(auth.uid(),'safety_officer',NULL)
);

-- Runs: read scoped by BU; write while draft for auditor + privileged roles.
DROP POLICY IF EXISTS p_audit_runs_read ON public.safety_audit_runs;
CREATE POLICY p_audit_runs_read ON public.safety_audit_runs
FOR SELECT TO authenticated
USING (
     public.has_safety_role(auth.uid(),'admin',NULL)
  OR public.has_safety_role(auth.uid(),'safety_head',NULL)
  OR public.has_safety_role(auth.uid(),'safety_officer',NULL)
  OR public.has_safety_role(auth.uid(),'auditor',NULL)
  OR public.has_safety_role(auth.uid(),'manager',business_unit_id)
  OR public.has_safety_role(auth.uid(),'bu_head',business_unit_id)
  OR public.has_safety_role(auth.uid(),'supervisor',business_unit_id)
  OR conducted_by = auth.uid()
);
DROP POLICY IF EXISTS p_audit_runs_insert ON public.safety_audit_runs;
CREATE POLICY p_audit_runs_insert ON public.safety_audit_runs
FOR INSERT TO authenticated
WITH CHECK (
     public.has_safety_role(auth.uid(),'admin',NULL)
  OR public.has_safety_role(auth.uid(),'safety_head',NULL)
  OR public.has_safety_role(auth.uid(),'safety_officer',NULL)
  OR public.has_safety_role(auth.uid(),'auditor',NULL)
);
DROP POLICY IF EXISTS p_audit_runs_update ON public.safety_audit_runs;
CREATE POLICY p_audit_runs_update ON public.safety_audit_runs
FOR UPDATE TO authenticated
USING (
  status = 'draft' AND (
       conducted_by = auth.uid()
    OR public.has_safety_role(auth.uid(),'admin',NULL)
    OR public.has_safety_role(auth.uid(),'safety_head',NULL)
    OR public.has_safety_role(auth.uid(),'safety_officer',NULL)
  )
)
WITH CHECK (true);
DROP POLICY IF EXISTS p_audit_runs_delete ON public.safety_audit_runs;
CREATE POLICY p_audit_runs_delete ON public.safety_audit_runs
FOR DELETE TO authenticated
USING (
  status = 'draft' AND (
       conducted_by = auth.uid()
    OR public.has_safety_role(auth.uid(),'admin',NULL)
    OR public.has_safety_role(auth.uid(),'safety_head',NULL)
  )
);

-- Responses: read mirrors run visibility; write while run is draft.
DROP POLICY IF EXISTS p_audit_resp_read ON public.safety_audit_run_responses;
CREATE POLICY p_audit_resp_read ON public.safety_audit_run_responses
FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.safety_audit_runs r WHERE r.id = run_id));
DROP POLICY IF EXISTS p_audit_resp_write ON public.safety_audit_run_responses;
CREATE POLICY p_audit_resp_write ON public.safety_audit_run_responses
FOR ALL TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.safety_audit_runs r
   WHERE r.id = run_id
     AND r.status = 'draft'
     AND (r.conducted_by = auth.uid()
          OR public.has_safety_role(auth.uid(),'admin',NULL)
          OR public.has_safety_role(auth.uid(),'safety_head',NULL)
          OR public.has_safety_role(auth.uid(),'safety_officer',NULL))
))
WITH CHECK (EXISTS (
  SELECT 1 FROM public.safety_audit_runs r
   WHERE r.id = run_id
     AND r.status = 'draft'
     AND (r.conducted_by = auth.uid()
          OR public.has_safety_role(auth.uid(),'admin',NULL)
          OR public.has_safety_role(auth.uid(),'safety_head',NULL)
          OR public.has_safety_role(auth.uid(),'safety_officer',NULL))
));

-- ── RPC: submit_audit_run ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.submit_audit_run(p_run_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_run public.safety_audit_runs%ROWTYPE;
  v_total_weight numeric := 0;
  v_total_points numeric := 0;
  v_score numeric;
  v_critical_failures integer := 0;
  v_resp record;
  v_inc_id uuid;
  v_inc_no text;
  v_ack_hours integer;
  v_close_hours integer;
BEGIN
  SELECT * INTO v_run FROM public.safety_audit_runs WHERE id = p_run_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'run_not_found');
  END IF;
  IF v_run.status <> 'draft' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_state:' || v_run.status);
  END IF;

  IF v_run.conducted_by IS DISTINCT FROM auth.uid()
     AND NOT public.has_safety_role(auth.uid(),'admin',NULL)
     AND NOT public.has_safety_role(auth.uid(),'safety_head',NULL)
     AND NOT public.has_safety_role(auth.uid(),'safety_officer',NULL) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authorised');
  END IF;

  -- Enforce evidence_required
  IF EXISTS (
    SELECT 1
      FROM public.safety_audit_run_responses r
      JOIN public.safety_audit_template_items i ON i.id = r.item_id
     WHERE r.run_id = p_run_id
       AND r.answer = 'no'
       AND i.evidence_required = true
       AND coalesce(trim(r.evidence_path), '') = ''
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'evidence_required_for_no');
  END IF;

  -- Score (weighted over non-NA items): yes=1, no=0
  FOR v_resp IN
    SELECT r.id          AS resp_id,
           r.answer,
           r.notes,
           r.evidence_path,
           i.id          AS item_id,
           i.weight,
           i.is_critical,
           i.prompt,
           i.section
      FROM public.safety_audit_run_responses r
      JOIN public.safety_audit_template_items i ON i.id = r.item_id
     WHERE r.run_id = p_run_id
  LOOP
    IF v_resp.answer = 'na' THEN CONTINUE; END IF;
    v_total_weight := v_total_weight + v_resp.weight;
    IF v_resp.answer = 'yes' THEN
      v_total_points := v_total_points + v_resp.weight;
      UPDATE public.safety_audit_run_responses SET score = v_resp.weight WHERE id = v_resp.resp_id;
    ELSE
      UPDATE public.safety_audit_run_responses SET score = 0 WHERE id = v_resp.resp_id;
    END IF;

    -- Auto-incident on critical NO
    IF v_resp.answer = 'no' AND v_resp.is_critical = true THEN
      v_critical_failures := v_critical_failures + 1;

      -- Severity & SLA
      v_ack_hours := 4; v_close_hours := 72;
      SELECT acknowledge_hours, close_hours INTO v_ack_hours, v_close_hours
        FROM public.safety_severity_sla WHERE severity = 'high';

      INSERT INTO public.safety_incidents (
        reporter_id, business_unit_id, department_id,
        incident_type, severity, status,
        title, description, location, occurred_at,
        acknowledge_due_at, close_due_at
      )
      VALUES (
        coalesce(v_run.conducted_by, auth.uid()),
        v_run.business_unit_id,
        v_run.department_id,
        'unsafe_condition'::public.safety_incident_type,
        'high'::public.safety_incident_severity,
        'reported'::public.safety_incident_status,
        left('Audit critical NO: ' || v_resp.prompt, 200),
        'Auto-created from audit run ' || p_run_id::text || E'\n\nSection: ' || v_resp.section
          || E'\nPrompt: ' || v_resp.prompt
          || coalesce(E'\nAuditor notes: ' || v_resp.notes, ''),
        coalesce(v_run.location, 'Unknown'),
        v_run.conducted_at,
        now() + (v_ack_hours || ' hours')::interval,
        now() + (v_close_hours || ' hours')::interval
      )
      RETURNING id, incident_number INTO v_inc_id, v_inc_no;

      UPDATE public.safety_audit_run_responses
         SET auto_incident_id = v_inc_id
       WHERE id = v_resp.resp_id;
    END IF;
  END LOOP;

  v_score := CASE WHEN v_total_weight = 0 THEN 0
                  ELSE round((v_total_points / v_total_weight) * 100, 2) END;

  PERFORM set_config('safety.audit_fsm','true', true);
  UPDATE public.safety_audit_runs
     SET status            = 'submitted',
         score             = v_score,
         critical_failures = v_critical_failures
   WHERE id = p_run_id;
  PERFORM set_config('safety.audit_fsm','false', true);

  INSERT INTO public.safety_audit_log (actor_id, action, target_type, target_id, payload)
  VALUES (auth.uid(), 'audit_run.submitted', 'safety_audit_run', p_run_id,
          jsonb_build_object('score', v_score, 'critical_failures', v_critical_failures));

  RETURN jsonb_build_object('ok', true, 'score', v_score, 'critical_failures', v_critical_failures);
END $$;

REVOKE ALL ON FUNCTION public.submit_audit_run(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_audit_run(uuid) TO authenticated;

-- ── RPC: mark_audit_reviewed ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.mark_audit_reviewed(p_run_id uuid, p_summary text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_run public.safety_audit_runs%ROWTYPE;
BEGIN
  IF NOT (public.has_safety_role(auth.uid(),'admin',NULL)
       OR public.has_safety_role(auth.uid(),'safety_head',NULL)
       OR public.has_safety_role(auth.uid(),'safety_officer',NULL)) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authorised');
  END IF;
  SELECT * INTO v_run FROM public.safety_audit_runs WHERE id = p_run_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'run_not_found'); END IF;
  IF v_run.status <> 'submitted' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_state:' || v_run.status);
  END IF;

  PERFORM set_config('safety.audit_fsm','true', true);
  UPDATE public.safety_audit_runs
     SET status      = 'reviewed',
         reviewed_by = auth.uid(),
         reviewed_at = now(),
         summary     = coalesce(NULLIF(trim(p_summary), ''), summary)
   WHERE id = p_run_id;
  PERFORM set_config('safety.audit_fsm','false', true);

  INSERT INTO public.safety_audit_log (actor_id, action, target_type, target_id, payload)
  VALUES (auth.uid(), 'audit_run.reviewed', 'safety_audit_run', p_run_id, '{}'::jsonb);

  RETURN jsonb_build_object('ok', true);
END $$;

REVOKE ALL ON FUNCTION public.mark_audit_reviewed(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_audit_reviewed(uuid, text) TO authenticated;

-- Realtime
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.safety_audit_templates;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.safety_audit_template_items;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.safety_audit_runs;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.safety_audit_run_responses;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMENT ON TABLE public.safety_audit_templates IS 'Safety Phase 5 — checklist templates.';
COMMENT ON TABLE public.safety_audit_runs IS 'Safety Phase 5 — checklist executions; status RPC-only.';
COMMENT ON TABLE public.safety_audit_run_responses IS 'Safety Phase 5 — per-item answers; auto_incident_id links critical NOs.';