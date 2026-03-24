
-- ========================================
-- INCENTIVE MODULE: 6 tables + RLS
-- ========================================

-- Table 1: incentive_programs
CREATE TABLE public.incentive_programs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  program_type text NOT NULL DEFAULT 'support',
  description text,
  is_active boolean NOT NULL DEFAULT true,
  effective_from date,
  effective_to date,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.incentive_programs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can manage incentive_programs" ON public.incentive_programs FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "HR and management can view incentive_programs" ON public.incentive_programs FOR SELECT TO authenticated USING (has_role(auth.uid(), 'hr_pms'::app_role) OR has_role(auth.uid(), 'management'::app_role));
CREATE POLICY "Authenticated can view active programs" ON public.incentive_programs FOR SELECT TO authenticated USING (is_active = true);
CREATE TRIGGER set_updated_at_incentive_programs BEFORE UPDATE ON public.incentive_programs FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Table 2: incentive_slabs
CREATE TABLE public.incentive_slabs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id uuid NOT NULL REFERENCES public.incentive_programs(id) ON DELETE CASCADE,
  business_unit_id uuid REFERENCES public.business_units(id),
  slab_category text NOT NULL,
  sub_category text,
  min_value numeric NOT NULL,
  max_value numeric NOT NULL,
  incentive_percent numeric NOT NULL DEFAULT 0,
  rating_label text,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.incentive_slabs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can manage incentive_slabs" ON public.incentive_slabs FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Authenticated can view incentive_slabs" ON public.incentive_slabs FOR SELECT TO authenticated USING (true);
CREATE TRIGGER set_updated_at_incentive_slabs BEFORE UPDATE ON public.incentive_slabs FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Table 3: incentive_disqualification_rules
CREATE TABLE public.incentive_disqualification_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id uuid NOT NULL REFERENCES public.incentive_programs(id) ON DELETE CASCADE,
  rule_type text NOT NULL,
  rule_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  exemption_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.incentive_disqualification_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can manage incentive_disqualification_rules" ON public.incentive_disqualification_rules FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Authenticated can view incentive_disqualification_rules" ON public.incentive_disqualification_rules FOR SELECT TO authenticated USING (true);
CREATE TRIGGER set_updated_at_incentive_dq_rules BEFORE UPDATE ON public.incentive_disqualification_rules FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Table 4: employee_incentive_eligibility
CREATE TABLE public.employee_incentive_eligibility (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL,
  review_period text NOT NULL,
  review_year int NOT NULL,
  absent_days int NOT NULL DEFAULT 0,
  lwp_days numeric NOT NULL DEFAULT 0,
  has_warning_letter boolean NOT NULL DEFAULT false,
  is_suspended boolean NOT NULL DEFAULT false,
  is_contract_worker boolean NOT NULL DEFAULT false,
  lti_count int NOT NULL DEFAULT 0,
  department_lti_count int NOT NULL DEFAULT 0,
  total_working_days int,
  present_days numeric,
  weekly_off_days int,
  production_value numeric,
  availability_percent numeric,
  shutdown_hours numeric,
  remarks text,
  entered_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (employee_id, review_period, review_year)
);
ALTER TABLE public.employee_incentive_eligibility ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can manage employee_incentive_eligibility" ON public.employee_incentive_eligibility FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "HR can manage eligibility" ON public.employee_incentive_eligibility FOR ALL TO authenticated USING (has_role(auth.uid(), 'hr_pms'::app_role));
CREATE POLICY "Management can view eligibility" ON public.employee_incentive_eligibility FOR SELECT TO authenticated USING (has_role(auth.uid(), 'management'::app_role));
CREATE POLICY "Employees can view own eligibility" ON public.employee_incentive_eligibility FOR SELECT TO authenticated USING (employee_id = auth.uid());
CREATE TRIGGER set_updated_at_employee_incentive_eligibility BEFORE UPDATE ON public.employee_incentive_eligibility FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Table 5: employee_incentive_records
CREATE TABLE public.employee_incentive_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL,
  program_id uuid REFERENCES public.incentive_programs(id),
  review_period text NOT NULL,
  review_year int NOT NULL,
  pms_score numeric,
  production_value numeric,
  matched_slab_id uuid REFERENCES public.incentive_slabs(id),
  base_incentive_percent numeric NOT NULL DEFAULT 0,
  is_disqualified boolean NOT NULL DEFAULT false,
  disqualification_reasons text[],
  lti_penalty_percent numeric NOT NULL DEFAULT 0,
  pro_rata_factor numeric NOT NULL DEFAULT 1.0,
  final_incentive_percent numeric NOT NULL DEFAULT 0,
  is_retroactive_adjustment boolean NOT NULL DEFAULT false,
  original_score numeric,
  adjusted_score numeric,
  adjustment_source_period text,
  status text NOT NULL DEFAULT 'draft',
  computed_at timestamptz,
  confirmed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (employee_id, review_period, review_year, program_id)
);
ALTER TABLE public.employee_incentive_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can manage employee_incentive_records" ON public.employee_incentive_records FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "HR can manage incentive records" ON public.employee_incentive_records FOR ALL TO authenticated USING (has_role(auth.uid(), 'hr_pms'::app_role));
CREATE POLICY "Management can view incentive records" ON public.employee_incentive_records FOR SELECT TO authenticated USING (has_role(auth.uid(), 'management'::app_role));
CREATE POLICY "Employees can view own incentive records" ON public.employee_incentive_records FOR SELECT TO authenticated USING (employee_id = auth.uid());
CREATE TRIGGER set_updated_at_employee_incentive_records BEFORE UPDATE ON public.employee_incentive_records FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Table 6: incentive_score_revisions
CREATE TABLE public.incentive_score_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL,
  affected_period text NOT NULL,
  affected_year int NOT NULL,
  original_score numeric,
  revised_score numeric,
  original_slab_percent numeric,
  revised_slab_percent numeric,
  revision_reason text NOT NULL,
  source_kpi_id uuid,
  source_period text,
  is_payroll_notified boolean NOT NULL DEFAULT false,
  notified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.incentive_score_revisions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can manage incentive_score_revisions" ON public.incentive_score_revisions FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "HR can manage score revisions" ON public.incentive_score_revisions FOR ALL TO authenticated USING (has_role(auth.uid(), 'hr_pms'::app_role));
CREATE POLICY "Management can view score revisions" ON public.incentive_score_revisions FOR SELECT TO authenticated USING (has_role(auth.uid(), 'management'::app_role));
CREATE POLICY "Employees can view own revisions" ON public.incentive_score_revisions FOR SELECT TO authenticated USING (employee_id = auth.uid());
