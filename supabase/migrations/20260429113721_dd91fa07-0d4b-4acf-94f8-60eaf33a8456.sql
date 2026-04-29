
-- ============================================================================
-- PHASE 2A — Permit to Work: Schema, RLS, RPCs, Triggers, Cron
-- ============================================================================

-- ── Enums ────────────────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE public.safety_permit_type AS ENUM (
    'hot_work','confined_space','work_at_height','electrical',
    'excavation','lifting','general'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.safety_permit_status AS ENUM (
    'draft','submitted','in_approval','approved',
    'active','suspended','closed','rejected','expired'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── Sequence for PTW-YYYY-NNNN ──────────────────────────────────────────────
CREATE SEQUENCE IF NOT EXISTS public.safety_permit_number_seq;

-- ── Approval-ladder config (per permit type) ────────────────────────────────
CREATE TABLE IF NOT EXISTS public.safety_permit_type_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  permit_type public.safety_permit_type NOT NULL,
  level smallint NOT NULL CHECK (level BETWEEN 1 AND 6),
  approver_role public.safety_app_role NOT NULL,
  label text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (permit_type, level)
);
ALTER TABLE public.safety_permit_type_config ENABLE ROW LEVEL SECURITY;

-- ── Core permit table ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.safety_permits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  permit_number text UNIQUE,
  permit_type public.safety_permit_type NOT NULL,
  status public.safety_permit_status NOT NULL DEFAULT 'draft',
  requested_by uuid NOT NULL,
  business_unit_id uuid,
  department_id uuid,
  location text NOT NULL,
  scope text NOT NULL,
  start_at timestamptz NOT NULL,
  end_at timestamptz NOT NULL,
  hira_summary text,
  loto_required boolean NOT NULL DEFAULT false,
  current_level smallint NOT NULL DEFAULT 0,
  total_levels smallint NOT NULL DEFAULT 0,
  linked_asset_ids uuid[] NOT NULL DEFAULT '{}',
  rejection_reason text,
  suspended_reason text,
  closed_by uuid,
  closed_at timestamptz,
  expired_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (end_at > start_at)
);
ALTER TABLE public.safety_permits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.safety_permits REPLICA IDENTITY FULL;

CREATE INDEX IF NOT EXISTS idx_safety_permits_requester ON public.safety_permits(requested_by);
CREATE INDEX IF NOT EXISTS idx_safety_permits_status ON public.safety_permits(status);
CREATE INDEX IF NOT EXISTS idx_safety_permits_bu ON public.safety_permits(business_unit_id);
CREATE INDEX IF NOT EXISTS idx_safety_permits_end_at ON public.safety_permits(end_at) WHERE status = 'active';

-- ── Approval rows (one per ladder level, materialised on submit) ────────────
CREATE TABLE IF NOT EXISTS public.safety_permit_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  permit_id uuid NOT NULL REFERENCES public.safety_permits(id) ON DELETE CASCADE,
  level smallint NOT NULL,
  approver_role public.safety_app_role NOT NULL,
  approver_id uuid,
  decision text CHECK (decision IN ('approved','rejected')),
  decided_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (permit_id, level)
);
ALTER TABLE public.safety_permit_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.safety_permit_approvals REPLICA IDENTITY FULL;

CREATE INDEX IF NOT EXISTS idx_permit_approvals_permit ON public.safety_permit_approvals(permit_id);
CREATE INDEX IF NOT EXISTS idx_permit_approvals_role ON public.safety_permit_approvals(approver_role) WHERE decision IS NULL;

-- ── HIRA rows ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.safety_permit_hira (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  permit_id uuid NOT NULL REFERENCES public.safety_permits(id) ON DELETE CASCADE,
  hazard text NOT NULL,
  risk_before text NOT NULL,
  controls text NOT NULL,
  risk_after text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.safety_permit_hira ENABLE ROW LEVEL SECURITY;

-- ── LOTO steps ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.safety_permit_loto_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  permit_id uuid NOT NULL REFERENCES public.safety_permits(id) ON DELETE CASCADE,
  step_no smallint NOT NULL,
  description text NOT NULL,
  isolated_by uuid,
  isolated_at timestamptz,
  verified_by uuid,
  verified_at timestamptz,
  removed_by uuid,
  removed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (permit_id, step_no)
);
ALTER TABLE public.safety_permit_loto_steps ENABLE ROW LEVEL SECURITY;

-- ── Evidence ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.safety_permit_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  permit_id uuid NOT NULL REFERENCES public.safety_permits(id) ON DELETE CASCADE,
  stage text NOT NULL,
  file_path text NOT NULL,
  file_name text NOT NULL,
  mime_type text,
  size_bytes bigint,
  uploaded_by uuid NOT NULL,
  uploaded_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.safety_permit_evidence ENABLE ROW LEVEL SECURITY;

-- ── Helper: is this user an approver on this permit? ────────────────────────
CREATE OR REPLACE FUNCTION public.is_permit_approver(_uid uuid, _permit_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.safety_permit_approvals a
    WHERE a.permit_id = _permit_id
      AND public.has_safety_role(_uid, a.approver_role, NULL)
  );
$$;

-- ── Helper: assign next permit number ───────────────────────────────────────
CREATE OR REPLACE FUNCTION public.assign_permit_number()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.permit_number IS NULL THEN
    NEW.permit_number := 'PTW-' || to_char(now(), 'YYYY') || '-' ||
                         lpad(nextval('public.safety_permit_number_seq')::text, 4, '0');
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_assign_permit_number ON public.safety_permits;
CREATE TRIGGER trg_assign_permit_number
  BEFORE INSERT ON public.safety_permits
  FOR EACH ROW EXECUTE FUNCTION public.assign_permit_number();

-- ── Trigger: block direct status writes (must use RPC) ──────────────────────
CREATE OR REPLACE FUNCTION public.guard_permit_status_write()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status
     AND COALESCE(current_setting('safety.permit_fsm', true), '') <> 'true' THEN
    RAISE EXCEPTION 'safety_permits.status must be changed via RPC (current=%, new=%)',
      OLD.status, NEW.status;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_guard_permit_status_write ON public.safety_permits;
CREATE TRIGGER trg_guard_permit_status_write
  BEFORE UPDATE ON public.safety_permits
  FOR EACH ROW EXECUTE FUNCTION public.guard_permit_status_write();

-- ── RLS policies ────────────────────────────────────────────────────────────

-- safety_permit_type_config: read by any safety user; mutate by admin
DROP POLICY IF EXISTS "permit_type_config_read" ON public.safety_permit_type_config;
CREATE POLICY "permit_type_config_read" ON public.safety_permit_type_config
  FOR SELECT TO authenticated
  USING (public.has_any_safety_role(auth.uid()));

DROP POLICY IF EXISTS "permit_type_config_admin_write" ON public.safety_permit_type_config;
CREATE POLICY "permit_type_config_admin_write" ON public.safety_permit_type_config
  FOR ALL TO authenticated
  USING (public.has_safety_role(auth.uid(), 'admin', NULL))
  WITH CHECK (public.has_safety_role(auth.uid(), 'admin', NULL));

-- safety_permits SELECT: admin/head + requester + approver + same-BU manager
DROP POLICY IF EXISTS "permits_select" ON public.safety_permits;
CREATE POLICY "permits_select" ON public.safety_permits
  FOR SELECT TO authenticated
  USING (
    public.has_safety_role(auth.uid(), 'admin', NULL)
    OR public.has_safety_role(auth.uid(), 'safety_head', NULL)
    OR public.has_safety_role(auth.uid(), 'safety_officer', NULL)
    OR requested_by = auth.uid()
    OR public.is_permit_approver(auth.uid(), id)
    OR public.has_safety_role(auth.uid(), 'manager', business_unit_id)
    OR public.has_safety_role(auth.uid(), 'bu_head', business_unit_id)
  );

-- safety_permits INSERT: any safety user (must be requester)
DROP POLICY IF EXISTS "permits_insert" ON public.safety_permits;
CREATE POLICY "permits_insert" ON public.safety_permits
  FOR INSERT TO authenticated
  WITH CHECK (
    requested_by = auth.uid()
    AND public.has_any_safety_role(auth.uid())
  );

-- safety_permits UPDATE: requester (drafts) or admin/head (any). Status guarded by trigger.
DROP POLICY IF EXISTS "permits_update" ON public.safety_permits;
CREATE POLICY "permits_update" ON public.safety_permits
  FOR UPDATE TO authenticated
  USING (
    public.has_safety_role(auth.uid(), 'admin', NULL)
    OR public.has_safety_role(auth.uid(), 'safety_head', NULL)
    OR (requested_by = auth.uid() AND status = 'draft')
    OR public.is_permit_approver(auth.uid(), id)
  )
  WITH CHECK (
    public.has_safety_role(auth.uid(), 'admin', NULL)
    OR public.has_safety_role(auth.uid(), 'safety_head', NULL)
    OR (requested_by = auth.uid() AND status IN ('draft','active'))
    OR public.is_permit_approver(auth.uid(), id)
  );

DROP POLICY IF EXISTS "permits_delete_admin" ON public.safety_permits;
CREATE POLICY "permits_delete_admin" ON public.safety_permits
  FOR DELETE TO authenticated
  USING (public.has_safety_role(auth.uid(), 'admin', NULL));

-- Approvals follow the parent permit
DROP POLICY IF EXISTS "permit_approvals_select" ON public.safety_permit_approvals;
CREATE POLICY "permit_approvals_select" ON public.safety_permit_approvals
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.safety_permits p WHERE p.id = permit_id));

DROP POLICY IF EXISTS "permit_approvals_update" ON public.safety_permit_approvals;
CREATE POLICY "permit_approvals_update" ON public.safety_permit_approvals
  FOR UPDATE TO authenticated
  USING (
    public.has_safety_role(auth.uid(), 'admin', NULL)
    OR public.has_safety_role(auth.uid(), approver_role, NULL)
  );

-- HIRA, LOTO, evidence: read by anyone who can read the parent permit; write by requester/admin
DROP POLICY IF EXISTS "permit_hira_select" ON public.safety_permit_hira;
CREATE POLICY "permit_hira_select" ON public.safety_permit_hira
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.safety_permits p WHERE p.id = permit_id));
DROP POLICY IF EXISTS "permit_hira_write" ON public.safety_permit_hira;
CREATE POLICY "permit_hira_write" ON public.safety_permit_hira
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.safety_permits p
                 WHERE p.id = permit_id
                   AND (p.requested_by = auth.uid()
                        OR public.has_safety_role(auth.uid(),'admin',NULL)
                        OR public.has_safety_role(auth.uid(),'safety_head',NULL))))
  WITH CHECK (EXISTS (SELECT 1 FROM public.safety_permits p
                      WHERE p.id = permit_id
                        AND (p.requested_by = auth.uid()
                             OR public.has_safety_role(auth.uid(),'admin',NULL)
                             OR public.has_safety_role(auth.uid(),'safety_head',NULL))));

DROP POLICY IF EXISTS "permit_loto_select" ON public.safety_permit_loto_steps;
CREATE POLICY "permit_loto_select" ON public.safety_permit_loto_steps
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.safety_permits p WHERE p.id = permit_id));
DROP POLICY IF EXISTS "permit_loto_write" ON public.safety_permit_loto_steps;
CREATE POLICY "permit_loto_write" ON public.safety_permit_loto_steps
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.safety_permits p
                 WHERE p.id = permit_id
                   AND (p.requested_by = auth.uid()
                        OR public.is_permit_approver(auth.uid(), p.id)
                        OR public.has_safety_role(auth.uid(),'admin',NULL)
                        OR public.has_safety_role(auth.uid(),'safety_head',NULL)
                        OR public.has_safety_role(auth.uid(),'safety_officer',NULL))))
  WITH CHECK (EXISTS (SELECT 1 FROM public.safety_permits p
                      WHERE p.id = permit_id));

DROP POLICY IF EXISTS "permit_evidence_select" ON public.safety_permit_evidence;
CREATE POLICY "permit_evidence_select" ON public.safety_permit_evidence
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.safety_permits p WHERE p.id = permit_id));
DROP POLICY IF EXISTS "permit_evidence_insert" ON public.safety_permit_evidence;
CREATE POLICY "permit_evidence_insert" ON public.safety_permit_evidence
  FOR INSERT TO authenticated
  WITH CHECK (uploaded_by = auth.uid()
              AND EXISTS (SELECT 1 FROM public.safety_permits p WHERE p.id = permit_id));

-- ── RPC: submit_permit ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.submit_permit(p_permit_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_permit public.safety_permits%ROWTYPE;
  v_count int;
  v_levels int;
BEGIN
  SELECT * INTO v_permit FROM public.safety_permits WHERE id = p_permit_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'permit_not_found'); END IF;
  IF v_permit.requested_by <> auth.uid() AND NOT public.has_safety_role(auth.uid(),'admin',NULL) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_owner');
  END IF;
  IF v_permit.status <> 'draft' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_state:' || v_permit.status);
  END IF;
  SELECT count(*) INTO v_count FROM public.safety_permit_hira WHERE permit_id = p_permit_id;
  IF v_count = 0 THEN RETURN jsonb_build_object('ok', false, 'error', 'hira_required'); END IF;
  IF v_permit.loto_required THEN
    SELECT count(*) INTO v_count FROM public.safety_permit_loto_steps WHERE permit_id = p_permit_id;
    IF v_count = 0 THEN RETURN jsonb_build_object('ok', false, 'error', 'loto_steps_required'); END IF;
  END IF;

  -- Materialise approval rows from config
  INSERT INTO public.safety_permit_approvals (permit_id, level, approver_role)
  SELECT p_permit_id, c.level, c.approver_role
  FROM public.safety_permit_type_config c
  WHERE c.permit_type = v_permit.permit_type AND c.is_active = true
  ON CONFLICT DO NOTHING;

  SELECT count(*) INTO v_levels FROM public.safety_permit_approvals WHERE permit_id = p_permit_id;
  IF v_levels = 0 THEN RETURN jsonb_build_object('ok', false, 'error', 'no_approval_ladder_configured'); END IF;

  PERFORM set_config('safety.permit_fsm','true', true);
  UPDATE public.safety_permits
     SET status = 'in_approval', current_level = 1, total_levels = v_levels
   WHERE id = p_permit_id;
  PERFORM set_config('safety.permit_fsm','false', true);

  INSERT INTO public.safety_audit_log (actor_id, action, target_type, target_id, payload)
  VALUES (auth.uid(), 'permit.submitted', 'safety_permit', p_permit_id,
          jsonb_build_object('levels', v_levels));

  RETURN jsonb_build_object('ok', true, 'levels', v_levels);
END $$;

-- ── RPC: decide_permit_level ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.decide_permit_level(
  p_permit_id uuid, p_decision text, p_notes text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_permit public.safety_permits%ROWTYPE;
  v_appr public.safety_permit_approvals%ROWTYPE;
  v_next_status public.safety_permit_status;
  v_next_level smallint;
BEGIN
  IF p_decision NOT IN ('approved','rejected') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_decision');
  END IF;
  SELECT * INTO v_permit FROM public.safety_permits WHERE id = p_permit_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'permit_not_found'); END IF;
  IF v_permit.status NOT IN ('in_approval','submitted') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_state:' || v_permit.status);
  END IF;

  SELECT * INTO v_appr FROM public.safety_permit_approvals
   WHERE permit_id = p_permit_id AND level = v_permit.current_level FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'no_pending_level'); END IF;
  IF v_appr.decision IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'level_already_decided');
  END IF;
  IF NOT public.has_safety_role(auth.uid(), v_appr.approver_role, NULL) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authorised_for_level');
  END IF;

  UPDATE public.safety_permit_approvals
     SET decision = p_decision, decided_at = now(), approver_id = auth.uid(), notes = p_notes
   WHERE id = v_appr.id;

  IF p_decision = 'rejected' THEN
    v_next_status := 'rejected';
    v_next_level := v_permit.current_level;
  ELSIF v_permit.current_level >= v_permit.total_levels THEN
    v_next_status := 'approved';
    v_next_level := v_permit.current_level;
  ELSE
    v_next_status := 'in_approval';
    v_next_level := v_permit.current_level + 1;
  END IF;

  PERFORM set_config('safety.permit_fsm','true', true);
  UPDATE public.safety_permits
     SET status = v_next_status,
         current_level = v_next_level,
         rejection_reason = CASE WHEN p_decision='rejected' THEN p_notes ELSE rejection_reason END
   WHERE id = p_permit_id;
  PERFORM set_config('safety.permit_fsm','false', true);

  INSERT INTO public.safety_audit_log (actor_id, action, target_type, target_id, payload)
  VALUES (auth.uid(), 'permit.decision', 'safety_permit', p_permit_id,
          jsonb_build_object('level', v_appr.level, 'decision', p_decision));

  RETURN jsonb_build_object('ok', true, 'status', v_next_status, 'next_level', v_next_level);
END $$;

-- ── RPC: activate_permit ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.activate_permit(p_permit_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_permit public.safety_permits%ROWTYPE;
  v_expired_asset uuid;
  v_assets_table_exists boolean;
BEGIN
  SELECT * INTO v_permit FROM public.safety_permits WHERE id = p_permit_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'permit_not_found'); END IF;
  IF v_permit.status <> 'approved' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_state:' || v_permit.status);
  END IF;
  IF v_permit.requested_by <> auth.uid()
     AND NOT public.has_safety_role(auth.uid(),'safety_officer',NULL)
     AND NOT public.has_safety_role(auth.uid(),'safety_head',NULL)
     AND NOT public.has_safety_role(auth.uid(),'admin',NULL) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authorised');
  END IF;
  IF now() < v_permit.start_at THEN
    RETURN jsonb_build_object('ok', false, 'error', 'before_start_at');
  END IF;
  IF now() >= v_permit.end_at THEN
    RETURN jsonb_build_object('ok', false, 'error', 'after_end_at');
  END IF;

  -- Phase-4 soft check: only if safety_assets table exists
  SELECT EXISTS (SELECT 1 FROM information_schema.tables
                 WHERE table_schema='public' AND table_name='safety_assets')
    INTO v_assets_table_exists;
  IF v_assets_table_exists AND array_length(v_permit.linked_asset_ids,1) > 0 THEN
    EXECUTE format(
      'SELECT id FROM public.safety_assets WHERE id = ANY($1) AND calibration_expires_at < now() LIMIT 1'
    ) INTO v_expired_asset USING v_permit.linked_asset_ids;
    IF v_expired_asset IS NOT NULL THEN
      RETURN jsonb_build_object('ok', false, 'error', 'asset_expired:' || v_expired_asset);
    END IF;
  END IF;

  PERFORM set_config('safety.permit_fsm','true', true);
  UPDATE public.safety_permits SET status = 'active' WHERE id = p_permit_id;
  PERFORM set_config('safety.permit_fsm','false', true);

  INSERT INTO public.safety_audit_log (actor_id, action, target_type, target_id, payload)
  VALUES (auth.uid(), 'permit.activated', 'safety_permit', p_permit_id, '{}'::jsonb);

  RETURN jsonb_build_object('ok', true);
END $$;

-- ── RPC: suspend / close ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.suspend_permit(p_permit_id uuid, p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_permit public.safety_permits%ROWTYPE;
BEGIN
  IF coalesce(length(trim(p_reason)),0) < 5 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'reason_too_short');
  END IF;
  SELECT * INTO v_permit FROM public.safety_permits WHERE id = p_permit_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'permit_not_found'); END IF;
  IF v_permit.status <> 'active' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_state:' || v_permit.status);
  END IF;
  IF NOT (public.has_safety_role(auth.uid(),'safety_officer',NULL)
       OR public.has_safety_role(auth.uid(),'safety_head',NULL)
       OR public.has_safety_role(auth.uid(),'admin',NULL)) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authorised');
  END IF;
  PERFORM set_config('safety.permit_fsm','true', true);
  UPDATE public.safety_permits SET status='suspended', suspended_reason=p_reason WHERE id=p_permit_id;
  PERFORM set_config('safety.permit_fsm','false', true);
  INSERT INTO public.safety_audit_log (actor_id, action, target_type, target_id, payload)
  VALUES (auth.uid(), 'permit.suspended', 'safety_permit', p_permit_id,
          jsonb_build_object('reason', p_reason));
  RETURN jsonb_build_object('ok', true);
END $$;

CREATE OR REPLACE FUNCTION public.close_permit(p_permit_id uuid, p_notes text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_permit public.safety_permits%ROWTYPE;
BEGIN
  SELECT * INTO v_permit FROM public.safety_permits WHERE id = p_permit_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'permit_not_found'); END IF;
  IF v_permit.status NOT IN ('active','suspended') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_state:' || v_permit.status);
  END IF;
  IF NOT (v_permit.requested_by = auth.uid()
       OR public.has_safety_role(auth.uid(),'safety_officer',NULL)
       OR public.has_safety_role(auth.uid(),'safety_head',NULL)
       OR public.has_safety_role(auth.uid(),'admin',NULL)) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authorised');
  END IF;
  PERFORM set_config('safety.permit_fsm','true', true);
  UPDATE public.safety_permits
     SET status='closed', closed_at=now(), closed_by=auth.uid()
   WHERE id=p_permit_id;
  PERFORM set_config('safety.permit_fsm','false', true);
  INSERT INTO public.safety_audit_log (actor_id, action, target_type, target_id, payload)
  VALUES (auth.uid(), 'permit.closed', 'safety_permit', p_permit_id,
          jsonb_build_object('notes', p_notes));
  RETURN jsonb_build_object('ok', true);
END $$;

-- ── Auto-expire sweep (called by edge fn / pg_cron) ─────────────────────────
CREATE OR REPLACE FUNCTION public.expire_overdue_permits()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_count int := 0; r record;
BEGIN
  FOR r IN
    SELECT id FROM public.safety_permits
     WHERE status IN ('approved','active') AND end_at < now()
     LIMIT 200
  LOOP
    PERFORM set_config('safety.permit_fsm','true', true);
    UPDATE public.safety_permits
       SET status='expired', expired_at=now()
     WHERE id = r.id;
    PERFORM set_config('safety.permit_fsm','false', true);
    -- automated action → performed_by/actor_id NULL per memory rule
    INSERT INTO public.safety_audit_log (actor_id, action, target_type, target_id, payload)
    VALUES (NULL, 'permit.auto_expired', 'safety_permit', r.id, '{}'::jsonb);
    v_count := v_count + 1;
  END LOOP;
  RETURN jsonb_build_object('ok', true, 'expired', v_count);
END $$;

-- ── Realtime publication ────────────────────────────────────────────────────
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.safety_permits;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.safety_permit_approvals;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── Seed default approval ladders (sane defaults; admin can edit) ───────────
INSERT INTO public.safety_permit_type_config (permit_type, level, approver_role, label) VALUES
  ('hot_work',        1, 'supervisor',     'Area Supervisor'),
  ('hot_work',        2, 'safety_officer', 'Safety Officer'),
  ('hot_work',        3, 'safety_head',    'Safety Head'),
  ('confined_space',  1, 'supervisor',     'Area Supervisor'),
  ('confined_space',  2, 'safety_officer', 'Safety Officer'),
  ('confined_space',  3, 'safety_head',    'Safety Head'),
  ('work_at_height',  1, 'supervisor',     'Area Supervisor'),
  ('work_at_height',  2, 'safety_officer', 'Safety Officer'),
  ('electrical',      1, 'supervisor',     'Area Supervisor'),
  ('electrical',      2, 'safety_officer', 'Safety Officer'),
  ('excavation',      1, 'supervisor',     'Area Supervisor'),
  ('excavation',      2, 'safety_officer', 'Safety Officer'),
  ('lifting',         1, 'supervisor',     'Area Supervisor'),
  ('lifting',         2, 'safety_officer', 'Safety Officer'),
  ('general',         1, 'supervisor',     'Area Supervisor')
ON CONFLICT (permit_type, level) DO NOTHING;
