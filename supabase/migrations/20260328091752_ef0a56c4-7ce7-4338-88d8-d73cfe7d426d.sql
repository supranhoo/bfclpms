
CREATE TABLE public.vessel_monthly_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  program_id uuid NOT NULL REFERENCES public.incentive_programs(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL,
  month text NOT NULL,
  year integer NOT NULL,
  vessels_handled integer NOT NULL DEFAULT 0,
  remarks text,
  updated_by uuid,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(program_id, employee_id, month, year)
);

ALTER TABLE public.vessel_monthly_entries ENABLE ROW LEVEL SECURITY;

-- Read access
CREATE POLICY "Authenticated users can read vessel entries"
  ON public.vessel_monthly_entries FOR SELECT TO authenticated USING (true);

-- Admin CRUD
CREATE POLICY "Admins can insert vessel entries"
  ON public.vessel_monthly_entries FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update vessel entries"
  ON public.vessel_monthly_entries FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete vessel entries"
  ON public.vessel_monthly_entries FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Menu override CRUD
CREATE POLICY "Menu override users can insert vessel entries"
  ON public.vessel_monthly_entries FOR INSERT TO authenticated
  WITH CHECK (public.has_menu_access_override(auth.uid(), 'admin-incentive'));

CREATE POLICY "Menu override users can update vessel entries"
  ON public.vessel_monthly_entries FOR UPDATE TO authenticated
  USING (public.has_menu_access_override(auth.uid(), 'admin-incentive'))
  WITH CHECK (public.has_menu_access_override(auth.uid(), 'admin-incentive'));

CREATE POLICY "Menu override users can delete vessel entries"
  ON public.vessel_monthly_entries FOR DELETE TO authenticated
  USING (public.has_menu_access_override(auth.uid(), 'admin-incentive'));

-- Updated_at trigger
CREATE TRIGGER update_vessel_monthly_entries_updated_at
  BEFORE UPDATE ON public.vessel_monthly_entries
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
