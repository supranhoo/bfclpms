
CREATE TABLE public.incentive_vessel_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id UUID NOT NULL REFERENCES public.incentive_programs(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  rate_per_vessel NUMERIC NOT NULL DEFAULT 10000,
  remarks TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (program_id, employee_id)
);

ALTER TABLE public.incentive_vessel_rates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read vessel rates"
  ON public.incentive_vessel_rates FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can insert vessel rates"
  ON public.incentive_vessel_rates FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update vessel rates"
  ON public.incentive_vessel_rates FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete vessel rates"
  ON public.incentive_vessel_rates FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_vessel_rates_updated_at
  BEFORE UPDATE ON public.incentive_vessel_rates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
