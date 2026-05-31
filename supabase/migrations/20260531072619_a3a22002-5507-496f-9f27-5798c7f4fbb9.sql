-- Phase: Trainee Confirmation Increment Adjustment

-- Additive profile fields (profiles is the canonical employee table)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS previous_employment_status text,
  ADD COLUMN IF NOT EXISTS confirmation_date date,
  ADD COLUMN IF NOT EXISTS confirmation_increment_granted boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS confirmation_increment_effective_date date;

-- Treatment enum
DO $$ BEGIN
  CREATE TYPE public.confirmation_increment_treatment AS ENUM (
    'ignore','adjust_covered_period','shift_next_cycle','carry_forward_uncovered'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Rule config (scope-keyed)
CREATE TABLE IF NOT EXISTS public.confirmation_increment_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_year text NOT NULL,
  company_id uuid NULL,
  category_id uuid NULL,
  level_id uuid NULL,
  treatment public.confirmation_increment_treatment NOT NULL DEFAULT 'ignore',
  notes text,
  version integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('draft','active','archived')),
  copied_from_rule_id uuid NULL,
  created_by uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_conf_inc_rule_active_scope
  ON public.confirmation_increment_rules (
    assessment_year,
    COALESCE(company_id, '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(category_id, '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(level_id, '00000000-0000-0000-0000-000000000000'::uuid)
  ) WHERE status = 'active';

GRANT SELECT, INSERT, UPDATE, DELETE ON public.confirmation_increment_rules TO authenticated;
GRANT ALL ON public.confirmation_increment_rules TO service_role;

ALTER TABLE public.confirmation_increment_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "conf_inc_rules_read_authenticated"
  ON public.confirmation_increment_rules FOR SELECT TO authenticated USING (true);

CREATE POLICY "conf_inc_rules_admin_write"
  ON public.confirmation_increment_rules FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "conf_inc_rules_admin_update"
  ON public.confirmation_increment_rules FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "conf_inc_rules_admin_delete"
  ON public.confirmation_increment_rules FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_conf_inc_rules_updated_at
  BEFORE UPDATE ON public.confirmation_increment_rules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Immutable audit per adjustment
CREATE TABLE IF NOT EXISTS public.confirmation_increment_adjustments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL,
  assessment_year text NOT NULL,
  run_id uuid NULL,
  treatment_applied public.confirmation_increment_treatment NOT NULL,
  period_covered_months numeric(6,2) NOT NULL DEFAULT 0,
  balance_eligible_months numeric(6,2) NOT NULL DEFAULT 0,
  carry_forward_months numeric(6,2) NOT NULL DEFAULT 0,
  final_eligible_months numeric(6,2) NOT NULL DEFAULT 0,
  adjustment_reason text,
  inputs_snapshot jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_conf_inc_adj_emp_ay
  ON public.confirmation_increment_adjustments (employee_id, assessment_year);

GRANT SELECT ON public.confirmation_increment_adjustments TO authenticated;
GRANT ALL ON public.confirmation_increment_adjustments TO service_role;

ALTER TABLE public.confirmation_increment_adjustments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "conf_inc_adj_read_admin_mgmt"
  ON public.confirmation_increment_adjustments FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'management'));