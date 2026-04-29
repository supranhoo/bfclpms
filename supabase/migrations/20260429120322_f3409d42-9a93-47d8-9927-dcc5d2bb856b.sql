-- Safety Phase 4 — Asset & Calibration

DO $$ BEGIN
  CREATE TYPE public.safety_asset_status AS ENUM ('active','under_maintenance','retired');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.safety_assets (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_code                  text NOT NULL UNIQUE,
  name                        text NOT NULL,
  category                    text NOT NULL,
  business_unit_id            uuid,
  department_id               uuid,
  location                    text,
  manufacturer                text,
  model                       text,
  serial_no                   text,
  install_date                date,
  calibration_required        boolean NOT NULL DEFAULT false,
  calibration_interval_days   integer,
  last_calibration_at         timestamptz,
  calibration_expires_at      timestamptz,
  status                      public.safety_asset_status NOT NULL DEFAULT 'active',
  notes                       text,
  created_by                  uuid,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT safety_assets_interval_chk
    CHECK (calibration_interval_days IS NULL OR calibration_interval_days BETWEEN 1 AND 3650)
);

CREATE INDEX IF NOT EXISTS idx_safety_assets_bu        ON public.safety_assets(business_unit_id);
CREATE INDEX IF NOT EXISTS idx_safety_assets_dept      ON public.safety_assets(department_id);
CREATE INDEX IF NOT EXISTS idx_safety_assets_category  ON public.safety_assets(category);
CREATE INDEX IF NOT EXISTS idx_safety_assets_expires   ON public.safety_assets(calibration_expires_at)
  WHERE calibration_required = true;
CREATE INDEX IF NOT EXISTS idx_safety_assets_status    ON public.safety_assets(status);

CREATE OR REPLACE FUNCTION public.safety_assets_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS trg_safety_assets_touch ON public.safety_assets;
CREATE TRIGGER trg_safety_assets_touch
BEFORE UPDATE ON public.safety_assets
FOR EACH ROW EXECUTE FUNCTION public.safety_assets_touch_updated_at();

CREATE TABLE IF NOT EXISTS public.safety_asset_calibrations (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id          uuid NOT NULL REFERENCES public.safety_assets(id) ON DELETE CASCADE,
  performed_by      uuid,
  performed_by_name text,
  performed_at      timestamptz NOT NULL,
  next_due_at       timestamptz NOT NULL,
  certificate_url   text,
  notes             text,
  created_by        uuid,
  created_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT safety_asset_calibrations_window_chk CHECK (next_due_at > performed_at)
);
CREATE INDEX IF NOT EXISTS idx_safety_asset_cal_asset ON public.safety_asset_calibrations(asset_id, performed_at DESC);

CREATE TABLE IF NOT EXISTS public.safety_asset_evidence (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id     uuid NOT NULL REFERENCES public.safety_assets(id) ON DELETE CASCADE,
  kind         text NOT NULL CHECK (kind IN ('photo','manual','certificate','other')),
  file_path    text NOT NULL,
  caption      text,
  uploaded_by  uuid,
  uploaded_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_safety_asset_evidence_asset ON public.safety_asset_evidence(asset_id);

ALTER TABLE public.safety_assets               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.safety_asset_calibrations   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.safety_asset_evidence       ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS p_assets_read ON public.safety_assets;
CREATE POLICY p_assets_read ON public.safety_assets
FOR SELECT TO authenticated
USING (
     public.has_safety_role(auth.uid(),'admin',NULL)
  OR public.has_safety_role(auth.uid(),'safety_head',NULL)
  OR public.has_safety_role(auth.uid(),'safety_officer',NULL)
  OR public.has_safety_role(auth.uid(),'auditor',NULL)
  OR public.has_safety_role(auth.uid(),'manager',business_unit_id)
  OR public.has_safety_role(auth.uid(),'bu_head',business_unit_id)
  OR public.has_safety_role(auth.uid(),'supervisor',business_unit_id)
);

DROP POLICY IF EXISTS p_assets_write ON public.safety_assets;
CREATE POLICY p_assets_write ON public.safety_assets
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

DROP POLICY IF EXISTS p_cal_read ON public.safety_asset_calibrations;
CREATE POLICY p_cal_read ON public.safety_asset_calibrations
FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.safety_assets a WHERE a.id = asset_id));

DROP POLICY IF EXISTS p_cal_write ON public.safety_asset_calibrations;
CREATE POLICY p_cal_write ON public.safety_asset_calibrations
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

DROP POLICY IF EXISTS p_evidence_read ON public.safety_asset_evidence;
CREATE POLICY p_evidence_read ON public.safety_asset_evidence
FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.safety_assets a WHERE a.id = asset_id));

DROP POLICY IF EXISTS p_evidence_write ON public.safety_asset_evidence;
CREATE POLICY p_evidence_write ON public.safety_asset_evidence
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

CREATE OR REPLACE FUNCTION public.record_calibration(
  p_asset_id          uuid,
  p_performed_at      timestamptz,
  p_next_due_at       timestamptz,
  p_certificate_url   text DEFAULT NULL,
  p_notes             text DEFAULT NULL,
  p_performed_by_name text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_asset public.safety_assets%ROWTYPE;
  v_cal_id uuid;
BEGIN
  IF NOT (public.has_safety_role(auth.uid(),'admin',NULL)
       OR public.has_safety_role(auth.uid(),'safety_head',NULL)
       OR public.has_safety_role(auth.uid(),'safety_officer',NULL)) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authorised');
  END IF;

  SELECT * INTO v_asset FROM public.safety_assets WHERE id = p_asset_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'asset_not_found');
  END IF;

  IF NOT v_asset.calibration_required THEN
    RETURN jsonb_build_object('ok', false, 'error', 'calibration_not_required');
  END IF;

  IF p_performed_at IS NULL OR p_next_due_at IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'missing_dates');
  END IF;
  IF p_next_due_at <= p_performed_at THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_window');
  END IF;
  IF p_performed_at > now() + interval '1 minute' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'performed_in_future');
  END IF;

  INSERT INTO public.safety_asset_calibrations
    (asset_id, performed_by, performed_by_name, performed_at, next_due_at, certificate_url, notes, created_by)
  VALUES
    (p_asset_id, auth.uid(), p_performed_by_name, p_performed_at, p_next_due_at,
     NULLIF(trim(p_certificate_url), ''), NULLIF(trim(p_notes), ''), auth.uid())
  RETURNING id INTO v_cal_id;

  UPDATE public.safety_assets
     SET last_calibration_at    = p_performed_at,
         calibration_expires_at = p_next_due_at
   WHERE id = p_asset_id;

  INSERT INTO public.safety_audit_log (actor_id, action, target_type, target_id, payload)
  VALUES (auth.uid(), 'asset.calibration_recorded', 'safety_asset', p_asset_id,
          jsonb_build_object('calibration_id', v_cal_id, 'next_due_at', p_next_due_at));

  RETURN jsonb_build_object('ok', true, 'calibration_id', v_cal_id);
END $$;

REVOKE ALL ON FUNCTION public.record_calibration(uuid, timestamptz, timestamptz, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_calibration(uuid, timestamptz, timestamptz, text, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.mark_overdue_assets()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_t7 int := 0; v_t1 int := 0; v_overdue int := 0;
BEGIN
  SELECT count(*) INTO v_t7
    FROM public.safety_assets
   WHERE calibration_required AND status = 'active'
     AND calibration_expires_at IS NOT NULL
     AND calibration_expires_at::date = (now() + interval '7 days')::date;

  SELECT count(*) INTO v_t1
    FROM public.safety_assets
   WHERE calibration_required AND status = 'active'
     AND calibration_expires_at IS NOT NULL
     AND calibration_expires_at::date = (now() + interval '1 day')::date;

  SELECT count(*) INTO v_overdue
    FROM public.safety_assets
   WHERE calibration_required AND status = 'active'
     AND calibration_expires_at IS NOT NULL
     AND calibration_expires_at < now();

  RETURN jsonb_build_object('ok', true, 't7', v_t7, 't1', v_t1, 'overdue', v_overdue);
END $$;

REVOKE ALL ON FUNCTION public.mark_overdue_assets() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_overdue_assets() TO authenticated, service_role;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.safety_assets;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.safety_asset_calibrations;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.safety_asset_evidence;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMENT ON TABLE  public.safety_assets IS 'Safety Phase 4 — asset register (calibration-tracked equipment).';
COMMENT ON TABLE  public.safety_asset_calibrations IS 'Append-only calibration history; latest event drives asset row.';
COMMENT ON TABLE  public.safety_asset_evidence IS 'Photos, manuals, certificates linked to an asset.';