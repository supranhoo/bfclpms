-- Employee Categories master (company-scoped, mirrors pms_grades)
CREATE TABLE public.employee_categories (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id uuid NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  code text NULL,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX employee_categories_company_name_uniq
  ON public.employee_categories (company_id, lower(name));

GRANT SELECT ON public.employee_categories TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.employee_categories TO authenticated;
GRANT ALL ON public.employee_categories TO service_role;

ALTER TABLE public.employee_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "employee_categories readable by authenticated"
  ON public.employee_categories FOR SELECT TO authenticated USING (true);
CREATE POLICY "employee_categories readable by anon"
  ON public.employee_categories FOR SELECT TO anon USING (true);
CREATE POLICY "employee_categories admin write"
  ON public.employee_categories FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));


-- Employment Statuses master (global, seeded)
CREATE TABLE public.employment_statuses (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  code text NULL,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX employment_statuses_name_uniq
  ON public.employment_statuses (lower(name));

GRANT SELECT ON public.employment_statuses TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.employment_statuses TO authenticated;
GRANT ALL ON public.employment_statuses TO service_role;

ALTER TABLE public.employment_statuses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "employment_statuses readable by authenticated"
  ON public.employment_statuses FOR SELECT TO authenticated USING (true);
CREATE POLICY "employment_statuses readable by anon"
  ON public.employment_statuses FOR SELECT TO anon USING (true);
CREATE POLICY "employment_statuses admin write"
  ON public.employment_statuses FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Seed the 5 standard employment statuses
INSERT INTO public.employment_statuses (name, code, sort_order) VALUES
  ('Probation', 'PROB', 10),
  ('Trainee', 'TRN', 20),
  ('Confirmed', 'CONF', 30),
  ('Superannuated', 'SUP', 40),
  ('Retainer', 'RTN', 50)
ON CONFLICT DO NOTHING;

-- Profile columns: text values mirroring pms_grade/designation pattern (not FKs).
-- Both nullable so existing employees are unaffected.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS employee_category text NULL,
  ADD COLUMN IF NOT EXISTS employment_status text NULL;
