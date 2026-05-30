
-- =========================================================================
-- Phase 19.5 — Increment Eligibility Criteria
-- =========================================================================

-- 1. CONFIGS ---------------------------------------------------------------
CREATE TABLE public.increment_eligibility_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        uuid NULL REFERENCES public.companies(id)      ON DELETE SET NULL,
  division_id       uuid NULL REFERENCES public.divisions(id)      ON DELETE SET NULL,
  business_unit_id  uuid NULL REFERENCES public.business_units(id) ON DELETE SET NULL,
  level_id          uuid NULL REFERENCES public.levels(id)         ON DELETE SET NULL,
  category_id       uuid NULL REFERENCES public.kra_categories(id) ON DELETE SET NULL,
  location_id       uuid NULL REFERENCES public.locations(id)      ON DELETE SET NULL,
  assessment_year   text NOT NULL,
  status            text NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft','pending_approval','approved','archived')),
  copied_from_config_id uuid NULL REFERENCES public.increment_eligibility_configs(id) ON DELETE SET NULL,
  created_by  uuid NULL,
  approved_by uuid NULL,
  approved_at timestamptz NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Unique scope: nulls treated as a value via coalesce to fixed sentinel uuid
CREATE UNIQUE INDEX uq_increment_eligibility_configs_scope
  ON public.increment_eligibility_configs (
    COALESCE(company_id,       '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(division_id,      '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(business_unit_id, '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(level_id,         '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(category_id,      '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(location_id,      '00000000-0000-0000-0000-000000000000'::uuid),
    assessment_year
  );

CREATE INDEX idx_iec_assessment_year ON public.increment_eligibility_configs(assessment_year);
CREATE INDEX idx_iec_status          ON public.increment_eligibility_configs(status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.increment_eligibility_configs TO authenticated;
GRANT ALL ON public.increment_eligibility_configs TO service_role;

ALTER TABLE public.increment_eligibility_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin/HR PMS read configs"
  ON public.increment_eligibility_configs FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'hr_pms'));

CREATE POLICY "Admin/HR PMS insert configs"
  ON public.increment_eligibility_configs FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'hr_pms'));

CREATE POLICY "Admin/HR PMS update configs"
  ON public.increment_eligibility_configs FOR UPDATE TO authenticated
  USING       (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'hr_pms'))
  WITH CHECK  (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'hr_pms'));

CREATE POLICY "Admin/HR PMS delete configs"
  ON public.increment_eligibility_configs FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'hr_pms'));

CREATE TRIGGER trg_iec_updated_at
  BEFORE UPDATE ON public.increment_eligibility_configs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. CRITERIA --------------------------------------------------------------
CREATE TABLE public.increment_eligibility_criteria (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  config_id uuid NOT NULL REFERENCES public.increment_eligibility_configs(id) ON DELETE CASCADE,
  criterion_key       text NOT NULL,
  criterion_name      text NOT NULL,
  description         text NULL,
  comparison_operator text NOT NULL CHECK (comparison_operator IN ('>=','<=','>','<','=')),
  threshold_value     numeric NOT NULL,
  unit_label          text NULL,
  is_active           boolean NOT NULL DEFAULT true,
  effective_date      date NOT NULL DEFAULT CURRENT_DATE,
  sort_order          int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_iecrit_config ON public.increment_eligibility_criteria(config_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.increment_eligibility_criteria TO authenticated;
GRANT ALL ON public.increment_eligibility_criteria TO service_role;

ALTER TABLE public.increment_eligibility_criteria ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin/HR PMS read criteria"
  ON public.increment_eligibility_criteria FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'hr_pms'));

CREATE POLICY "Admin/HR PMS insert criteria"
  ON public.increment_eligibility_criteria FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'hr_pms'));

CREATE POLICY "Admin/HR PMS update criteria"
  ON public.increment_eligibility_criteria FOR UPDATE TO authenticated
  USING       (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'hr_pms'))
  WITH CHECK  (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'hr_pms'));

CREATE POLICY "Admin/HR PMS delete criteria"
  ON public.increment_eligibility_criteria FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'hr_pms'));

CREATE TRIGGER trg_iecrit_updated_at
  BEFORE UPDATE ON public.increment_eligibility_criteria
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. AUDIT -----------------------------------------------------------------
CREATE TABLE public.increment_eligibility_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  config_id    uuid NULL,
  criterion_id uuid NULL,
  performed_by uuid NULL,
  performed_at timestamptz NOT NULL DEFAULT now(),
  action text NOT NULL
    CHECK (action IN ('create','modify','delete','activate','deactivate',
                      'submit','approve','reject','copy','publish')),
  previous_value  jsonb NULL,
  revised_value   jsonb NULL,
  company_label   text NULL,
  assessment_year text NULL
);

CREATE INDEX idx_iea_config        ON public.increment_eligibility_audit(config_id);
CREATE INDEX idx_iea_performed_at  ON public.increment_eligibility_audit(performed_at DESC);

GRANT SELECT, INSERT ON public.increment_eligibility_audit TO authenticated;
GRANT ALL ON public.increment_eligibility_audit TO service_role;

ALTER TABLE public.increment_eligibility_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin/HR PMS read audit"
  ON public.increment_eligibility_audit FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'hr_pms'));

CREATE POLICY "Admin/HR PMS insert audit"
  ON public.increment_eligibility_audit FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'hr_pms'));

-- 4. AUDIT TRIGGER on criteria --------------------------------------------
CREATE OR REPLACE FUNCTION public.log_increment_eligibility_criteria_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_action text;
  v_prev   jsonb;
  v_new    jsonb;
  v_config record;
  v_company_label text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_action := 'create';
    v_prev := NULL;
    v_new  := to_jsonb(NEW);
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.is_active = true AND NEW.is_active = false THEN
      v_action := 'deactivate';
    ELSIF OLD.is_active = false AND NEW.is_active = true THEN
      v_action := 'activate';
    ELSE
      v_action := 'modify';
    END IF;
    v_prev := to_jsonb(OLD);
    v_new  := to_jsonb(NEW);
  ELSE
    v_action := 'delete';
    v_prev := to_jsonb(OLD);
    v_new  := NULL;
  END IF;

  SELECT c.assessment_year, c.company_id INTO v_config
    FROM public.increment_eligibility_configs c
   WHERE c.id = COALESCE(NEW.config_id, OLD.config_id);

  SELECT co.name INTO v_company_label
    FROM public.companies co WHERE co.id = v_config.company_id;

  INSERT INTO public.increment_eligibility_audit
    (config_id, criterion_id, performed_by, action,
     previous_value, revised_value, company_label, assessment_year)
  VALUES
    (COALESCE(NEW.config_id, OLD.config_id),
     COALESCE(NEW.id, OLD.id),
     auth.uid(), v_action, v_prev, v_new,
     v_company_label, v_config.assessment_year);

  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER trg_iecrit_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.increment_eligibility_criteria
  FOR EACH ROW EXECUTE FUNCTION public.log_increment_eligibility_criteria_change();
