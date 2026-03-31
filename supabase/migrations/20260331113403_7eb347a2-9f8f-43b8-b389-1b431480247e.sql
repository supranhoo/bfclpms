
-- Table 1: Per-employee production rates
CREATE TABLE public.incentive_production_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id UUID NOT NULL REFERENCES public.incentive_programs(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  rate_per_ton NUMERIC NOT NULL DEFAULT 0,
  remarks TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(program_id, employee_id)
);

ALTER TABLE public.incentive_production_rates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read production rates"
  ON public.incentive_production_rates FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins and menu-override users can manage production rates"
  ON public.incentive_production_rates FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_menu_access_override(auth.uid(), 'incentive-config'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_menu_access_override(auth.uid(), 'incentive-config'));

-- Table 2: Daily production entries
CREATE TABLE public.production_daily_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id UUID NOT NULL REFERENCES public.incentive_programs(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  month TEXT NOT NULL,
  year INT NOT NULL,
  daily_values JSONB NOT NULL DEFAULT '{}',
  updated_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(program_id, employee_id, month, year)
);

ALTER TABLE public.production_daily_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read daily entries"
  ON public.production_daily_entries FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins and menu-override users can manage daily entries"
  ON public.production_daily_entries FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_menu_access_override(auth.uid(), 'incentive-config'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_menu_access_override(auth.uid(), 'incentive-config'));
