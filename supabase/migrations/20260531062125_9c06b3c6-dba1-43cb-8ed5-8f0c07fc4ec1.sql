
-- ============================================================
-- Phase 1: Annual Score Calculation + Increment Method config
-- ============================================================

-- ---------- Enums ----------
DO $$ BEGIN
  CREATE TYPE public.annual_score_method AS ENUM ('avg_all', 'last_6', 'custom');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.increment_method_type AS ENUM ('full', 'prorated_doj', 'custom');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.config_status AS ENUM ('draft', 'active', 'archived');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================
-- A1. Annual Score Calculation Configs
-- ============================================================
CREATE TABLE IF NOT EXISTS public.annual_score_configs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  assessment_year TEXT NOT NULL,
  -- Scope (NULL = ALL / unrestricted)
  company_id UUID NULL,
  division_id UUID NULL,
  business_unit_id UUID NULL,
  category_id UUID NULL,
  level_id UUID NULL,
  location_id UUID NULL,
  -- Method config
  method public.annual_score_method NOT NULL DEFAULT 'avg_all',
  custom_months INT[] NULL,  -- 1..12 calendar months (fiscal Jul-Jun)
  -- Versioning / audit
  version INT NOT NULL DEFAULT 1,
  status public.config_status NOT NULL DEFAULT 'active',
  copied_from_config_id UUID NULL REFERENCES public.annual_score_configs(id) ON DELETE SET NULL,
  notes TEXT NULL,
  created_by UUID NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.annual_score_configs TO authenticated;
GRANT ALL ON public.annual_score_configs TO service_role;

ALTER TABLE public.annual_score_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "annual_score_configs_read_authenticated"
  ON public.annual_score_configs FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "annual_score_configs_admin_hrpms_write"
  ON public.annual_score_configs FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'hr_pms'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'hr_pms'));

CREATE INDEX IF NOT EXISTS annual_score_configs_ay_status_idx
  ON public.annual_score_configs(assessment_year, status);

-- Validation: custom_months required when method=custom; months in 1..12
CREATE OR REPLACE FUNCTION public.validate_annual_score_config()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.method = 'custom' THEN
    IF NEW.custom_months IS NULL OR array_length(NEW.custom_months, 1) IS NULL THEN
      RAISE EXCEPTION 'custom_months required when method = custom';
    END IF;
    IF EXISTS (SELECT 1 FROM unnest(NEW.custom_months) m WHERE m < 1 OR m > 12) THEN
      RAISE EXCEPTION 'custom_months must contain values between 1 and 12';
    END IF;
  END IF;
  NEW.updated_at = now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_validate_annual_score_config ON public.annual_score_configs;
CREATE TRIGGER trg_validate_annual_score_config
  BEFORE INSERT OR UPDATE ON public.annual_score_configs
  FOR EACH ROW EXECUTE FUNCTION public.validate_annual_score_config();

-- ---------- Annual Score audit log ----------
CREATE TABLE IF NOT EXISTS public.annual_score_config_audit (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  config_id UUID NOT NULL REFERENCES public.annual_score_configs(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  prev_value JSONB NULL,
  new_value JSONB NULL,
  performed_by UUID NULL,
  performed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.annual_score_config_audit TO authenticated;
GRANT ALL ON public.annual_score_config_audit TO service_role;

ALTER TABLE public.annual_score_config_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "annual_score_audit_read_admin_hrpms"
  ON public.annual_score_config_audit FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'hr_pms'));

CREATE POLICY "annual_score_audit_insert_authenticated"
  ON public.annual_score_config_audit FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS annual_score_audit_config_idx
  ON public.annual_score_config_audit(config_id, performed_at DESC);

-- ============================================================
-- A3. Increment Method Configs
-- ============================================================
CREATE TABLE IF NOT EXISTS public.increment_method_configs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  assessment_year TEXT NOT NULL,
  -- Scope
  company_id UUID NULL,
  division_id UUID NULL,
  business_unit_id UUID NULL,
  category_id UUID NULL,
  level_id UUID NULL,
  location_id UUID NULL,
  -- Method
  method public.increment_method_type NOT NULL DEFAULT 'full',
  -- Versioning
  version INT NOT NULL DEFAULT 1,
  status public.config_status NOT NULL DEFAULT 'active',
  copied_from_config_id UUID NULL REFERENCES public.increment_method_configs(id) ON DELETE SET NULL,
  notes TEXT NULL,
  created_by UUID NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.increment_method_configs TO authenticated;
GRANT ALL ON public.increment_method_configs TO service_role;

ALTER TABLE public.increment_method_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "increment_method_configs_read_authenticated"
  ON public.increment_method_configs FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "increment_method_configs_admin_hrpms_write"
  ON public.increment_method_configs FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'hr_pms'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'hr_pms'));

CREATE INDEX IF NOT EXISTS increment_method_configs_ay_status_idx
  ON public.increment_method_configs(assessment_year, status);

CREATE OR REPLACE FUNCTION public.touch_increment_method_configs()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS trg_touch_increment_method_configs ON public.increment_method_configs;
CREATE TRIGGER trg_touch_increment_method_configs
  BEFORE UPDATE ON public.increment_method_configs
  FOR EACH ROW EXECUTE FUNCTION public.touch_increment_method_configs();

-- ---------- Custom service-period slabs ----------
CREATE TABLE IF NOT EXISTS public.increment_method_slabs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  method_config_id UUID NOT NULL REFERENCES public.increment_method_configs(id) ON DELETE CASCADE,
  from_months NUMERIC NOT NULL,         -- inclusive lower bound (e.g. 0, 3, 6, 9)
  to_months NUMERIC NULL,               -- exclusive/inclusive upper; NULL = ∞
  percent_of_slab NUMERIC NOT NULL,     -- 0..100
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.increment_method_slabs TO authenticated;
GRANT ALL ON public.increment_method_slabs TO service_role;

ALTER TABLE public.increment_method_slabs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "increment_method_slabs_read_authenticated"
  ON public.increment_method_slabs FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "increment_method_slabs_admin_hrpms_write"
  ON public.increment_method_slabs FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'hr_pms'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'hr_pms'));

CREATE INDEX IF NOT EXISTS increment_method_slabs_config_idx
  ON public.increment_method_slabs(method_config_id, sort_order);

-- Validate slab row bounds
CREATE OR REPLACE FUNCTION public.validate_increment_method_slab()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.from_months < 0 THEN
    RAISE EXCEPTION 'from_months must be >= 0';
  END IF;
  IF NEW.to_months IS NOT NULL AND NEW.to_months <= NEW.from_months THEN
    RAISE EXCEPTION 'to_months must be > from_months (or NULL for infinity)';
  END IF;
  IF NEW.percent_of_slab < 0 OR NEW.percent_of_slab > 100 THEN
    RAISE EXCEPTION 'percent_of_slab must be between 0 and 100';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_validate_increment_method_slab ON public.increment_method_slabs;
CREATE TRIGGER trg_validate_increment_method_slab
  BEFORE INSERT OR UPDATE ON public.increment_method_slabs
  FOR EACH ROW EXECUTE FUNCTION public.validate_increment_method_slab();
