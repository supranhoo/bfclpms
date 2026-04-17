
-- 1. Locations master table
CREATE TABLE public.locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  code text,
  company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_locations_name_lower ON public.locations (lower(name));
CREATE UNIQUE INDEX idx_locations_code_lower ON public.locations (lower(code)) WHERE code IS NOT NULL;
CREATE INDEX idx_locations_company ON public.locations (company_id);
CREATE INDEX idx_locations_active ON public.locations (is_active);

ALTER TABLE public.locations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Locations readable by authenticated"
  ON public.locations FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins manage locations - insert"
  ON public.locations FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins manage locations - update"
  ON public.locations FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins manage locations - delete"
  ON public.locations FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_locations_updated_at
  BEFORE UPDATE ON public.locations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. profiles.location_id FK
ALTER TABLE public.profiles
  ADD COLUMN location_id uuid REFERENCES public.locations(id) ON DELETE SET NULL;

CREATE INDEX idx_profiles_location_id ON public.profiles (location_id);

-- 3. Import field settings
CREATE TABLE public.import_field_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  import_type text NOT NULL,
  field_key text NOT NULL,
  field_label text NOT NULL,
  is_mandatory boolean NOT NULL DEFAULT false,
  is_visible boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  UNIQUE (import_type, field_key)
);

CREATE INDEX idx_import_field_settings_type ON public.import_field_settings (import_type);

ALTER TABLE public.import_field_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Import field settings readable by authenticated"
  ON public.import_field_settings FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins manage import field settings - insert"
  ON public.import_field_settings FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins manage import field settings - update"
  ON public.import_field_settings FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins manage import field settings - delete"
  ON public.import_field_settings FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_import_field_settings_updated_at
  BEFORE UPDATE ON public.import_field_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed defaults for employee import
INSERT INTO public.import_field_settings (import_type, field_key, field_label, is_mandatory, is_visible, sort_order) VALUES
  ('employee', 'employeeCode',      'Employee Code',     true,  true, 10),
  ('employee', 'fullName',          'Full Name',         true,  true, 20),
  ('employee', 'email',             'Email',             false, true, 30),
  ('employee', 'designation',       'Designation',       false, true, 40),
  ('employee', 'division',          'Division',          false, true, 50),
  ('employee', 'businessUnit',      'Business Unit',     false, true, 60),
  ('employee', 'department',        'Department',        false, true, 70),
  ('employee', 'location',          'Location',          false, true, 75),
  ('employee', 'pmsGrade',          'PMS Grade',         false, true, 80),
  ('employee', 'managerEmployeeId', 'Manager Emp ID',    false, true, 90),
  ('employee', 'managerName',       'Manager Name',      false, true, 100),
  ('employee', 'role',              'Role',              false, true, 110)
ON CONFLICT (import_type, field_key) DO NOTHING;
