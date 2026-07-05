
-- 1. Criteria library
CREATE TABLE public.annual_review_criteria_library (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL UNIQUE,
  label_en TEXT NOT NULL,
  label_hi TEXT,
  max_score NUMERIC NOT NULL DEFAULT 5 CHECK (max_score > 0),
  scoring_bands JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_common BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.annual_review_criteria_library TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.annual_review_criteria_library TO authenticated;
GRANT ALL ON public.annual_review_criteria_library TO service_role;

ALTER TABLE public.annual_review_criteria_library ENABLE ROW LEVEL SECURITY;

CREATE POLICY criteria_library_read_all_authenticated
  ON public.annual_review_criteria_library FOR SELECT
  TO authenticated USING (true);

CREATE POLICY criteria_library_manage_admin_hr
  ON public.annual_review_criteria_library FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'hr_pms'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'hr_pms'::app_role));

-- 2. Criteria assignment matrix
CREATE TABLE public.annual_review_criteria_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  criterion_id UUID NOT NULL REFERENCES public.annual_review_criteria_library(id) ON DELETE CASCADE,
  archetype_code TEXT,          -- NULL = any (A/B/C/D)
  grade_bucket TEXT,            -- NULL = any (M/W/T/other)
  department_id UUID REFERENCES public.departments(id) ON DELETE CASCADE,
  sub_unit_id UUID REFERENCES public.business_unit_sub_units(id) ON DELETE CASCADE,
  weight_pct NUMERIC NOT NULL DEFAULT 0 CHECK (weight_pct >= 0),
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX annual_review_criteria_assignments_uk
  ON public.annual_review_criteria_assignments (
    criterion_id,
    COALESCE(archetype_code, ''),
    COALESCE(grade_bucket, ''),
    COALESCE(department_id::text, ''),
    COALESCE(sub_unit_id::text, '')
  );

CREATE INDEX annual_review_criteria_assignments_lookup
  ON public.annual_review_criteria_assignments (archetype_code, grade_bucket, department_id, sub_unit_id);

GRANT SELECT ON public.annual_review_criteria_assignments TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.annual_review_criteria_assignments TO authenticated;
GRANT ALL ON public.annual_review_criteria_assignments TO service_role;

ALTER TABLE public.annual_review_criteria_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY criteria_assignments_read_all_authenticated
  ON public.annual_review_criteria_assignments FOR SELECT
  TO authenticated USING (true);

CREATE POLICY criteria_assignments_manage_admin_hr
  ON public.annual_review_criteria_assignments FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'hr_pms'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'hr_pms'::app_role));

-- 3. updated_at triggers
CREATE TRIGGER trg_criteria_library_updated_at
  BEFORE UPDATE ON public.annual_review_criteria_library
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_criteria_assignments_updated_at
  BEFORE UPDATE ON public.annual_review_criteria_assignments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
