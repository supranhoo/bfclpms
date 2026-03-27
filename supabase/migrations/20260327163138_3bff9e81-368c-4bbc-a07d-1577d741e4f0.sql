
-- =====================================================
-- Incentive Phase 2: Production Targets, BU Sub-units,
-- Allocation Rules, Status Override, Program Settings
-- =====================================================

-- a) Alter incentive_programs: 3 new columns
ALTER TABLE public.incentive_programs
  ADD COLUMN IF NOT EXISTS incentive_base text NOT NULL DEFAULT 'basic_salary',
  ADD COLUMN IF NOT EXISTS min_kra_score numeric NOT NULL DEFAULT 3.0,
  ADD COLUMN IF NOT EXISTS no_kra_eligible boolean NOT NULL DEFAULT true;

-- b) Alter incentive_slabs: 2 new columns
ALTER TABLE public.incentive_slabs
  ADD COLUMN IF NOT EXISTS department_id uuid REFERENCES public.departments(id),
  ADD COLUMN IF NOT EXISTS applicable_designations text[];

-- c) Alter employee_incentive_records: incentive_status + override columns
ALTER TABLE public.employee_incentive_records
  ADD COLUMN IF NOT EXISTS incentive_status text NOT NULL DEFAULT 'hold',
  ADD COLUMN IF NOT EXISTS status_override_reason text,
  ADD COLUMN IF NOT EXISTS status_overridden_by uuid,
  ADD COLUMN IF NOT EXISTS status_overridden_at timestamptz;

-- d) New table: business_unit_sub_units
CREATE TABLE IF NOT EXISTS public.business_unit_sub_units (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_unit_id uuid NOT NULL REFERENCES public.business_units(id) ON DELETE CASCADE,
  label text NOT NULL,
  capacity text,
  product_types text[],
  sort_order int NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(business_unit_id, label)
);
ALTER TABLE public.business_unit_sub_units ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read sub-units" ON public.business_unit_sub_units FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage sub-units" ON public.business_unit_sub_units FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- e) New table: production_targets
CREATE TABLE IF NOT EXISTS public.production_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id uuid NOT NULL REFERENCES public.incentive_programs(id) ON DELETE CASCADE,
  division_id uuid REFERENCES public.divisions(id),
  business_unit_id uuid REFERENCES public.business_units(id),
  department_id uuid REFERENCES public.departments(id),
  sub_unit_label text,
  slab_category text NOT NULL DEFAULT 'production',
  month text NOT NULL,
  year int NOT NULL,
  target_value numeric NOT NULL DEFAULT 0,
  achieved_value numeric NOT NULL DEFAULT 0,
  incentive_percent numeric NOT NULL DEFAULT 0,
  remarks text,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(program_id, business_unit_id, sub_unit_label, slab_category, month, year)
);
ALTER TABLE public.production_targets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read production targets" ON public.production_targets FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage production targets" ON public.production_targets FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_production_targets_updated_at BEFORE UPDATE ON public.production_targets FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- f) New table: incentive_allocation_rules
CREATE TABLE IF NOT EXISTS public.incentive_allocation_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id uuid NOT NULL REFERENCES public.incentive_programs(id) ON DELETE CASCADE,
  source_label text NOT NULL,
  target_bu_id uuid REFERENCES public.business_units(id),
  target_sub_unit text,
  allocation_pct numeric NOT NULL DEFAULT 0,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(program_id, source_label, target_bu_id, target_sub_unit)
);
ALTER TABLE public.incentive_allocation_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read allocation rules" ON public.incentive_allocation_rules FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins can manage allocation rules" ON public.incentive_allocation_rules FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
