
-- =============================================================
-- B1: General Eligibility Configs
-- =============================================================
CREATE TABLE public.general_eligibility_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_year TEXT NOT NULL,
  category_ids UUID[] NOT NULL DEFAULT '{}',
  employment_statuses TEXT[] NOT NULL DEFAULT '{}',
  level_ids UUID[] NOT NULL DEFAULT '{}',
  min_service_months INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','archived')),
  version INTEGER NOT NULL DEFAULT 1,
  copied_from_id UUID REFERENCES public.general_eligibility_configs(id) ON DELETE SET NULL,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (assessment_year, version)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.general_eligibility_configs TO authenticated;
GRANT ALL ON public.general_eligibility_configs TO service_role;

ALTER TABLE public.general_eligibility_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin/HR PMS read general eligibility"
ON public.general_eligibility_configs FOR SELECT TO authenticated
USING (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'hr_pms'::app_role) OR has_role(auth.uid(),'management'::app_role));

CREATE POLICY "Admin/HR PMS insert general eligibility"
ON public.general_eligibility_configs FOR INSERT TO authenticated
WITH CHECK (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'hr_pms'::app_role));

CREATE POLICY "Admin/HR PMS update general eligibility"
ON public.general_eligibility_configs FOR UPDATE TO authenticated
USING (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'hr_pms'::app_role));

CREATE POLICY "Admin delete general eligibility"
ON public.general_eligibility_configs FOR DELETE TO authenticated
USING (has_role(auth.uid(),'admin'::app_role));

-- =============================================================
-- B2: Increment Slabs
-- =============================================================
CREATE TABLE public.increment_slabs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_year TEXT NOT NULL,
  increment_period TEXT,
  rating_from NUMERIC NOT NULL,
  rating_to NUMERIC NOT NULL,
  increment_percent NUMERIC NOT NULL,
  prorate_on_doj BOOLEAN NOT NULL DEFAULT true,
  company_ids UUID[] NOT NULL DEFAULT '{}',
  division_ids UUID[] NOT NULL DEFAULT '{}',
  business_unit_ids UUID[] NOT NULL DEFAULT '{}',
  location_ids UUID[] NOT NULL DEFAULT '{}',
  category_ids UUID[] NOT NULL DEFAULT '{}',
  level_ids UUID[] NOT NULL DEFAULT '{}',
  extra_attributes JSONB NOT NULL DEFAULT '{}'::jsonb,
  sort_order INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived')),
  version INTEGER NOT NULL DEFAULT 1,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (rating_to >= rating_from),
  CHECK (increment_percent >= 0 AND increment_percent <= 100)
);

CREATE INDEX idx_increment_slabs_year ON public.increment_slabs(assessment_year);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.increment_slabs TO authenticated;
GRANT ALL ON public.increment_slabs TO service_role;

ALTER TABLE public.increment_slabs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin/HR PMS read slabs"
ON public.increment_slabs FOR SELECT TO authenticated
USING (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'hr_pms'::app_role) OR has_role(auth.uid(),'management'::app_role));

CREATE POLICY "Admin/HR PMS write slabs"
ON public.increment_slabs FOR INSERT TO authenticated
WITH CHECK (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'hr_pms'::app_role));

CREATE POLICY "Admin/HR PMS update slabs"
ON public.increment_slabs FOR UPDATE TO authenticated
USING (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'hr_pms'::app_role));

CREATE POLICY "Admin delete slabs"
ON public.increment_slabs FOR DELETE TO authenticated
USING (has_role(auth.uid(),'admin'::app_role));

-- =============================================================
-- B3: Increment Inputs (per-employee per-year)
-- =============================================================
CREATE TABLE public.increment_inputs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_year TEXT NOT NULL,
  employee_id UUID NOT NULL,
  absent_days NUMERIC NOT NULL DEFAULT 0,
  lwp_days NUMERIC NOT NULL DEFAULT 0,
  disciplinary_actions INTEGER NOT NULL DEFAULT 0,
  training_compliance NUMERIC NOT NULL DEFAULT 0,
  current_salary NUMERIC,
  dynamic_metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
  source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','import','bulk')),
  remarks TEXT,
  updated_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (employee_id, assessment_year)
);

CREATE INDEX idx_increment_inputs_year ON public.increment_inputs(assessment_year);
CREATE INDEX idx_increment_inputs_employee ON public.increment_inputs(employee_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.increment_inputs TO authenticated;
GRANT ALL ON public.increment_inputs TO service_role;

ALTER TABLE public.increment_inputs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin/HR PMS read inputs"
ON public.increment_inputs FOR SELECT TO authenticated
USING (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'hr_pms'::app_role) OR has_role(auth.uid(),'management'::app_role));

CREATE POLICY "Admin/HR PMS insert inputs"
ON public.increment_inputs FOR INSERT TO authenticated
WITH CHECK (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'hr_pms'::app_role));

CREATE POLICY "Admin/HR PMS update inputs"
ON public.increment_inputs FOR UPDATE TO authenticated
USING (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'hr_pms'::app_role));

CREATE POLICY "Admin delete inputs"
ON public.increment_inputs FOR DELETE TO authenticated
USING (has_role(auth.uid(),'admin'::app_role));

-- =============================================================
-- B4: Increment Runs + Run Items
-- =============================================================
CREATE TABLE public.increment_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_year TEXT NOT NULL,
  scope_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  triggered_by UUID,
  triggered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running','completed','failed')),
  summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  error_message TEXT
);

CREATE INDEX idx_increment_runs_year ON public.increment_runs(assessment_year, triggered_at DESC);

GRANT SELECT, INSERT, UPDATE ON public.increment_runs TO authenticated;
GRANT ALL ON public.increment_runs TO service_role;

ALTER TABLE public.increment_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin/HR PMS read runs"
ON public.increment_runs FOR SELECT TO authenticated
USING (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'hr_pms'::app_role) OR has_role(auth.uid(),'management'::app_role));

CREATE POLICY "Admin/HR PMS write runs"
ON public.increment_runs FOR INSERT TO authenticated
WITH CHECK (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'hr_pms'::app_role));

CREATE POLICY "Admin/HR PMS update runs"
ON public.increment_runs FOR UPDATE TO authenticated
USING (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'hr_pms'::app_role));

CREATE TABLE public.increment_run_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES public.increment_runs(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL,
  pms_score NUMERIC,
  rating_band TEXT,
  slab_percent NUMERIC,
  eligibility_status TEXT NOT NULL CHECK (eligibility_status IN ('eligible','ineligible','excluded','no_score')),
  ineligibility_reason TEXT,
  method_used TEXT,
  eligible_percent NUMERIC,
  service_months NUMERIC,
  current_salary NUMERIC,
  increment_amount NUMERIC,
  revised_salary NUMERIC,
  remarks TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_increment_run_items_run ON public.increment_run_items(run_id);
CREATE INDEX idx_increment_run_items_emp ON public.increment_run_items(employee_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.increment_run_items TO authenticated;
GRANT ALL ON public.increment_run_items TO service_role;

ALTER TABLE public.increment_run_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin/HR PMS read run items"
ON public.increment_run_items FOR SELECT TO authenticated
USING (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'hr_pms'::app_role) OR has_role(auth.uid(),'management'::app_role));

CREATE POLICY "Employee read own run item"
ON public.increment_run_items FOR SELECT TO authenticated
USING (employee_id = auth.uid());

CREATE POLICY "Admin/HR PMS write run items"
ON public.increment_run_items FOR INSERT TO authenticated
WITH CHECK (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'hr_pms'::app_role));

CREATE POLICY "Admin/HR PMS update run items"
ON public.increment_run_items FOR UPDATE TO authenticated
USING (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'hr_pms'::app_role));

CREATE POLICY "Admin delete run items"
ON public.increment_run_items FOR DELETE TO authenticated
USING (has_role(auth.uid(),'admin'::app_role));

-- =============================================================
-- Audit Tables
-- =============================================================
CREATE TABLE public.general_eligibility_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  config_id UUID,
  assessment_year TEXT,
  action TEXT NOT NULL,
  previous_value JSONB,
  new_value JSONB,
  changed_by UUID,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.general_eligibility_audit TO authenticated;
GRANT ALL ON public.general_eligibility_audit TO service_role;

ALTER TABLE public.general_eligibility_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin/HR PMS read ge audit"
ON public.general_eligibility_audit FOR SELECT TO authenticated
USING (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'hr_pms'::app_role));

CREATE POLICY "Admin/HR PMS insert ge audit"
ON public.general_eligibility_audit FOR INSERT TO authenticated
WITH CHECK (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'hr_pms'::app_role));

CREATE TABLE public.increment_slabs_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slab_id UUID,
  assessment_year TEXT,
  action TEXT NOT NULL,
  previous_value JSONB,
  new_value JSONB,
  changed_by UUID,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.increment_slabs_audit TO authenticated;
GRANT ALL ON public.increment_slabs_audit TO service_role;

ALTER TABLE public.increment_slabs_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin/HR PMS read slab audit"
ON public.increment_slabs_audit FOR SELECT TO authenticated
USING (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'hr_pms'::app_role));

CREATE POLICY "Admin/HR PMS insert slab audit"
ON public.increment_slabs_audit FOR INSERT TO authenticated
WITH CHECK (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'hr_pms'::app_role));

-- Updated-at triggers
CREATE TRIGGER trg_ge_configs_updated_at BEFORE UPDATE ON public.general_eligibility_configs
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_inc_slabs_updated_at BEFORE UPDATE ON public.increment_slabs
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_inc_inputs_updated_at BEFORE UPDATE ON public.increment_inputs
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
