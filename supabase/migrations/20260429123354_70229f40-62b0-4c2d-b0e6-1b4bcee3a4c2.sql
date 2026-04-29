-- ───────────────────────────── Enums ─────────────────────────────
DO $$ BEGIN
  CREATE TYPE public.safety_drill_type AS ENUM (
    'fire','evacuation','spill','medical','chemical','security','earthquake','other'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.safety_drill_status AS ENUM (
    'scheduled','in_progress','completed','reviewed','cancelled'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.safety_emergency_contact_type AS ENUM (
    'internal','external_agency','hospital','fire_brigade','police','environmental','other'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ───────────────────────────── Tables ────────────────────────────
CREATE TABLE IF NOT EXISTS public.safety_emergency_drills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  drill_code TEXT NOT NULL UNIQUE,
  type public.safety_drill_type NOT NULL,
  scenario TEXT NOT NULL,
  business_unit_id UUID NULL,
  location TEXT NULL,
  scheduled_at TIMESTAMPTZ NOT NULL,
  started_at TIMESTAMPTZ NULL,
  completed_at TIMESTAMPTZ NULL,
  evacuation_seconds INTEGER NULL CHECK (evacuation_seconds IS NULL OR evacuation_seconds >= 0),
  score NUMERIC(5,2) NULL CHECK (score IS NULL OR (score >= 0 AND score <= 100)),
  status public.safety_drill_status NOT NULL DEFAULT 'scheduled',
  conducted_by UUID NULL,
  reviewed_by UUID NULL,
  reviewed_at TIMESTAMPTZ NULL,
  summary TEXT NULL,
  created_by UUID NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.safety_drill_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  drill_id UUID NOT NULL REFERENCES public.safety_emergency_drills(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  role TEXT NULL,
  mustered_at TIMESTAMPTZ NULL,
  accounted_for BOOLEAN NOT NULL DEFAULT FALSE,
  notes TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (drill_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.safety_drill_findings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  drill_id UUID NOT NULL REFERENCES public.safety_emergency_drills(id) ON DELETE CASCADE,
  severity TEXT NOT NULL DEFAULT 'low' CHECK (severity IN ('low','medium','high','critical')),
  observation TEXT NOT NULL,
  corrective_action TEXT NULL,
  owner_id UUID NULL,
  due_date DATE NULL,
  resolved_at TIMESTAMPTZ NULL,
  created_by UUID NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.safety_emergency_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  role_title TEXT NULL,
  phone_primary TEXT NOT NULL,
  phone_alt TEXT NULL,
  email TEXT NULL,
  business_unit_id UUID NULL,
  location TEXT NULL,
  contact_type public.safety_emergency_contact_type NOT NULL DEFAULT 'internal',
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_safety_drills_status ON public.safety_emergency_drills(status);
CREATE INDEX IF NOT EXISTS idx_safety_drills_scheduled_at ON public.safety_emergency_drills(scheduled_at DESC);
CREATE INDEX IF NOT EXISTS idx_safety_drills_bu ON public.safety_emergency_drills(business_unit_id);
CREATE INDEX IF NOT EXISTS idx_safety_drill_participants_drill ON public.safety_drill_participants(drill_id);
CREATE INDEX IF NOT EXISTS idx_safety_drill_findings_drill ON public.safety_drill_findings(drill_id);
CREATE INDEX IF NOT EXISTS idx_safety_emergency_contacts_active ON public.safety_emergency_contacts(is_active, sort_order);

-- updated_at triggers
CREATE TRIGGER trg_safety_emergency_drills_updated
  BEFORE UPDATE ON public.safety_emergency_drills
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_safety_drill_participants_updated
  BEFORE UPDATE ON public.safety_drill_participants
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_safety_drill_findings_updated
  BEFORE UPDATE ON public.safety_drill_findings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_safety_emergency_contacts_updated
  BEFORE UPDATE ON public.safety_emergency_contacts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ─────────────── Block direct status writes on drills ───────────
CREATE OR REPLACE FUNCTION public.safety_drills_block_status_writes()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    IF current_setting('app.safety_rpc', true) IS DISTINCT FROM 'on' THEN
      RAISE EXCEPTION 'Direct status writes blocked. Use start_drill / complete_drill / review_drill RPCs.';
    END IF;
  END IF;
  RETURN NEW;
END$$;

CREATE TRIGGER trg_safety_drills_block_status
  BEFORE UPDATE ON public.safety_emergency_drills
  FOR EACH ROW EXECUTE FUNCTION public.safety_drills_block_status_writes();

-- ───────────────────────────── RLS ───────────────────────────────
ALTER TABLE public.safety_emergency_drills ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.safety_drill_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.safety_drill_findings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.safety_emergency_contacts ENABLE ROW LEVEL SECURITY;

-- Drills
CREATE POLICY "drills_read_any_safety_role" ON public.safety_emergency_drills
  FOR SELECT USING (public.has_any_safety_role(auth.uid()));

CREATE POLICY "drills_insert_authorized" ON public.safety_emergency_drills
  FOR INSERT WITH CHECK (
    public.has_safety_role(auth.uid(), 'admin')
    OR public.has_safety_role(auth.uid(), 'safety_head')
    OR public.has_safety_role(auth.uid(), 'safety_officer')
    OR public.has_safety_role(auth.uid(), 'bu_head')
    OR public.has_safety_role(auth.uid(), 'supervisor')
  );

CREATE POLICY "drills_update_authorized" ON public.safety_emergency_drills
  FOR UPDATE USING (
    public.has_safety_role(auth.uid(), 'admin')
    OR public.has_safety_role(auth.uid(), 'safety_head')
    OR public.has_safety_role(auth.uid(), 'safety_officer')
    OR public.has_safety_role(auth.uid(), 'bu_head')
    OR public.has_safety_role(auth.uid(), 'supervisor')
  );

CREATE POLICY "drills_delete_admins" ON public.safety_emergency_drills
  FOR DELETE USING (
    public.has_safety_role(auth.uid(), 'admin')
    OR public.has_safety_role(auth.uid(), 'safety_head')
  );

-- Participants
CREATE POLICY "drill_participants_read" ON public.safety_drill_participants
  FOR SELECT USING (public.has_any_safety_role(auth.uid()));

CREATE POLICY "drill_participants_write" ON public.safety_drill_participants
  FOR ALL USING (
    public.has_safety_role(auth.uid(), 'admin')
    OR public.has_safety_role(auth.uid(), 'safety_head')
    OR public.has_safety_role(auth.uid(), 'safety_officer')
    OR public.has_safety_role(auth.uid(), 'bu_head')
    OR public.has_safety_role(auth.uid(), 'supervisor')
  ) WITH CHECK (
    public.has_safety_role(auth.uid(), 'admin')
    OR public.has_safety_role(auth.uid(), 'safety_head')
    OR public.has_safety_role(auth.uid(), 'safety_officer')
    OR public.has_safety_role(auth.uid(), 'bu_head')
    OR public.has_safety_role(auth.uid(), 'supervisor')
  );

-- Findings
CREATE POLICY "drill_findings_read" ON public.safety_drill_findings
  FOR SELECT USING (public.has_any_safety_role(auth.uid()));

CREATE POLICY "drill_findings_write" ON public.safety_drill_findings
  FOR ALL USING (
    public.has_safety_role(auth.uid(), 'admin')
    OR public.has_safety_role(auth.uid(), 'safety_head')
    OR public.has_safety_role(auth.uid(), 'safety_officer')
    OR public.has_safety_role(auth.uid(), 'bu_head')
    OR public.has_safety_role(auth.uid(), 'supervisor')
  ) WITH CHECK (
    public.has_safety_role(auth.uid(), 'admin')
    OR public.has_safety_role(auth.uid(), 'safety_head')
    OR public.has_safety_role(auth.uid(), 'safety_officer')
    OR public.has_safety_role(auth.uid(), 'bu_head')
    OR public.has_safety_role(auth.uid(), 'supervisor')
  );

-- Emergency contacts (anyone with a safety role can read; admin/head manage)
CREATE POLICY "contacts_read_any_safety_role" ON public.safety_emergency_contacts
  FOR SELECT USING (public.has_any_safety_role(auth.uid()));

CREATE POLICY "contacts_write_admins" ON public.safety_emergency_contacts
  FOR ALL USING (
    public.has_safety_role(auth.uid(), 'admin')
    OR public.has_safety_role(auth.uid(), 'safety_head')
  ) WITH CHECK (
    public.has_safety_role(auth.uid(), 'admin')
    OR public.has_safety_role(auth.uid(), 'safety_head')
  );

-- ───────────────────────────── RPCs ──────────────────────────────
CREATE OR REPLACE FUNCTION public.start_drill(p_drill_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_row public.safety_emergency_drills;
BEGIN
  IF NOT (
    public.has_safety_role(v_uid, 'admin')
    OR public.has_safety_role(v_uid, 'safety_head')
    OR public.has_safety_role(v_uid, 'safety_officer')
    OR public.has_safety_role(v_uid, 'bu_head')
    OR public.has_safety_role(v_uid, 'supervisor')
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  SELECT * INTO v_row FROM public.safety_emergency_drills WHERE id = p_drill_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;
  IF v_row.status <> 'scheduled' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_status');
  END IF;

  PERFORM set_config('app.safety_rpc', 'on', true);
  UPDATE public.safety_emergency_drills
     SET status = 'in_progress',
         started_at = now(),
         conducted_by = COALESCE(conducted_by, v_uid)
   WHERE id = p_drill_id;
  PERFORM set_config('app.safety_rpc', 'off', true);

  INSERT INTO public.safety_audit_log(event_type, entity_type, entity_id, performed_by, details)
  VALUES ('drill_started','safety_emergency_drill', p_drill_id, v_uid,
          jsonb_build_object('drill_code', v_row.drill_code));

  RETURN jsonb_build_object('ok', true);
END$$;

CREATE OR REPLACE FUNCTION public.complete_drill(
  p_drill_id UUID,
  p_evacuation_seconds INTEGER DEFAULT NULL,
  p_score NUMERIC DEFAULT NULL
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_row public.safety_emergency_drills;
BEGIN
  IF NOT (
    public.has_safety_role(v_uid, 'admin')
    OR public.has_safety_role(v_uid, 'safety_head')
    OR public.has_safety_role(v_uid, 'safety_officer')
    OR public.has_safety_role(v_uid, 'bu_head')
    OR public.has_safety_role(v_uid, 'supervisor')
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  SELECT * INTO v_row FROM public.safety_emergency_drills WHERE id = p_drill_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;
  IF v_row.status <> 'in_progress' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_status');
  END IF;
  IF p_score IS NOT NULL AND (p_score < 0 OR p_score > 100) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_score');
  END IF;
  IF p_evacuation_seconds IS NOT NULL AND p_evacuation_seconds < 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_seconds');
  END IF;

  PERFORM set_config('app.safety_rpc', 'on', true);
  UPDATE public.safety_emergency_drills
     SET status = 'completed',
         completed_at = now(),
         evacuation_seconds = COALESCE(p_evacuation_seconds, evacuation_seconds),
         score = COALESCE(p_score, score)
   WHERE id = p_drill_id;
  PERFORM set_config('app.safety_rpc', 'off', true);

  INSERT INTO public.safety_audit_log(event_type, entity_type, entity_id, performed_by, details)
  VALUES ('drill_completed','safety_emergency_drill', p_drill_id, v_uid,
          jsonb_build_object('evacuation_seconds', p_evacuation_seconds, 'score', p_score));

  RETURN jsonb_build_object('ok', true);
END$$;

CREATE OR REPLACE FUNCTION public.review_drill(p_drill_id UUID, p_summary TEXT DEFAULT NULL)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_row public.safety_emergency_drills;
BEGIN
  IF NOT (
    public.has_safety_role(v_uid, 'admin')
    OR public.has_safety_role(v_uid, 'safety_head')
    OR public.has_safety_role(v_uid, 'safety_officer')
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  SELECT * INTO v_row FROM public.safety_emergency_drills WHERE id = p_drill_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;
  IF v_row.status <> 'completed' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_status');
  END IF;

  PERFORM set_config('app.safety_rpc', 'on', true);
  UPDATE public.safety_emergency_drills
     SET status = 'reviewed',
         reviewed_at = now(),
         reviewed_by = v_uid,
         summary = COALESCE(p_summary, summary)
   WHERE id = p_drill_id;
  PERFORM set_config('app.safety_rpc', 'off', true);

  INSERT INTO public.safety_audit_log(event_type, entity_type, entity_id, performed_by, details)
  VALUES ('drill_reviewed','safety_emergency_drill', p_drill_id, v_uid,
          jsonb_build_object('drill_code', v_row.drill_code));

  RETURN jsonb_build_object('ok', true);
END$$;

-- Realtime
ALTER TABLE public.safety_emergency_drills REPLICA IDENTITY FULL;
ALTER TABLE public.safety_drill_participants REPLICA IDENTITY FULL;
ALTER TABLE public.safety_drill_findings REPLICA IDENTITY FULL;
ALTER TABLE public.safety_emergency_contacts REPLICA IDENTITY FULL;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.safety_emergency_drills;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.safety_drill_participants;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.safety_drill_findings;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.safety_emergency_contacts;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;