
-- =========================================================================
-- P1: System-KPI Library for Annual Review Template Factory
-- =========================================================================

-- 1. Grade family bucket on master (config-driven, zero hardcoding)
ALTER TABLE public.pms_grades
  ADD COLUMN IF NOT EXISTS family_bucket text
    CHECK (family_bucket IN ('M','W','T','other'));

COMMENT ON COLUMN public.pms_grades.family_bucket IS
  'Groups grade codes into archetype families used by the Annual Review Template Factory. M = manager/staff, W = worker, T = trainee, other = fallback.';

-- Backfill obvious prefixes; unknowns remain NULL for HR to classify.
UPDATE public.pms_grades
   SET family_bucket = CASE
     WHEN upper(code) LIKE 'M%' THEN 'M'
     WHEN upper(code) LIKE 'W%' THEN 'W'
     WHEN upper(code) LIKE 'T%' THEN 'T'
     ELSE family_bucket
   END
 WHERE family_bucket IS NULL AND code IS NOT NULL;

-- 2. Canonical System-KPI library
CREATE TABLE IF NOT EXISTS public.annual_review_system_kpis (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key            text NOT NULL UNIQUE,
  name_en        text NOT NULL,
  name_hi        text,
  description_en text,
  description_hi text,
  uom_type       text NOT NULL DEFAULT 'count'
                 CHECK (uom_type IN ('count','percent','days','rating')),
  scoring_rules  jsonb NOT NULL,
  is_active      boolean NOT NULL DEFAULT true,
  sort_order     integer NOT NULL DEFAULT 100,
  created_by     uuid,
  updated_by     uuid,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.annual_review_system_kpis IS
  'Shared library of system-scored KPIs consumed by the Annual Review Template Factory. Editing a row here propagates to every generated template.';

COMMENT ON COLUMN public.annual_review_system_kpis.scoring_rules IS
  'JSONB: { direction: "higher_better" | "lower_better", bands: [{ score: 5, threshold: <number> }, ...] }';

GRANT SELECT ON public.annual_review_system_kpis TO authenticated;
GRANT ALL    ON public.annual_review_system_kpis TO service_role;

ALTER TABLE public.annual_review_system_kpis ENABLE ROW LEVEL SECURITY;

CREATE POLICY "system_kpis_read_all_authenticated"
  ON public.annual_review_system_kpis
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "system_kpis_manage_admin_hr"
  ON public.annual_review_system_kpis
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'hr_pms'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'hr_pms'));

CREATE TRIGGER trg_annual_review_system_kpis_touch
  BEFORE UPDATE ON public.annual_review_system_kpis
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. Weight matrix (Dept × Sub-unit × Grade × KPI). NULL = wildcard.
CREATE TABLE IF NOT EXISTS public.annual_review_system_kpi_weights (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  system_kpi_id  uuid NOT NULL REFERENCES public.annual_review_system_kpis(id) ON DELETE CASCADE,
  department_id  uuid REFERENCES public.departments(id) ON DELETE CASCADE,
  sub_unit_id    uuid REFERENCES public.business_unit_sub_units(id) ON DELETE CASCADE,
  grade_bucket   text CHECK (grade_bucket IN ('M','W','T','other')),
  weight_pct     numeric(5,2) NOT NULL CHECK (weight_pct >= 0 AND weight_pct <= 100),
  created_by     uuid,
  updated_by     uuid,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.annual_review_system_kpi_weights IS
  'Weight matrix for annual_review_system_kpis. NULL in department_id / sub_unit_id / grade_bucket means "applies to all". Resolver picks the most-specific matching row per KPI.';

-- Uniqueness on the full key with NULLs treated as wildcards.
CREATE UNIQUE INDEX IF NOT EXISTS uq_ar_sys_kpi_weight_scope
  ON public.annual_review_system_kpi_weights (
    system_kpi_id,
    COALESCE(department_id, '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(sub_unit_id,   '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(grade_bucket,  '*')
  );

GRANT SELECT ON public.annual_review_system_kpi_weights TO authenticated;
GRANT ALL    ON public.annual_review_system_kpi_weights TO service_role;

ALTER TABLE public.annual_review_system_kpi_weights ENABLE ROW LEVEL SECURITY;

CREATE POLICY "system_kpi_weights_read_all_authenticated"
  ON public.annual_review_system_kpi_weights
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "system_kpi_weights_manage_admin_hr"
  ON public.annual_review_system_kpi_weights
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'hr_pms'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'hr_pms'));

CREATE TRIGGER trg_annual_review_system_kpi_weights_touch
  BEFORE UPDATE ON public.annual_review_system_kpi_weights
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4. Seed the 8 canonical KPIs. Idempotent — safe to re-run.
INSERT INTO public.annual_review_system_kpis
  (key, name_en, name_hi, description_en, uom_type, scoring_rules, sort_order)
VALUES
  ('lti_rate',
   'Lost Time Injury (LTI) Rate',
   'लॉस्ट टाइम इंजरी (LTI) दर',
   'Any departmental Lost Time Injury in AY 25-26',
   'count',
   '{"direction":"lower_better","bands":[{"score":5,"threshold":0},{"score":4,"threshold":1},{"score":3,"threshold":2},{"score":2,"threshold":3},{"score":1,"threshold":4},{"score":0,"threshold":"gt:4"}]}'::jsonb,
   10),
  ('sti_rate',
   'Short Time Injury (STI) Rate',
   'शॉर्ट टाइम इंजरी (STI) दर',
   'Any departmental STI in AY 25-26',
   'count',
   '{"direction":"lower_better","bands":[{"score":5,"threshold":0},{"score":4,"threshold":1},{"score":3,"threshold":2},{"score":2,"threshold":3},{"score":1,"threshold":4},{"score":0,"threshold":"gt:4"}]}'::jsonb,
   20),
  ('ua_uc_nm',
   'Unsafe Act / Unsafe Condition / Near Miss — Reported by self',
   'असुरक्षित कार्य / असुरक्षित स्थिति / नियर मिस — स्वयं द्वारा रिपोर्ट',
   'UA UC NM reported by self in AY 25-26',
   'count',
   '{"direction":"higher_better","bands":[{"score":5,"threshold":5},{"score":4,"threshold":4},{"score":3,"threshold":3},{"score":2,"threshold":2},{"score":1,"threshold":1},{"score":0,"threshold":0}]}'::jsonb,
   30),
  ('s5',
   'Departmental Status of 5S',
   'विभागीय 5S स्थिति',
   'Departmental Status of 5S in AY 25-26',
   'rating',
   '{"direction":"higher_better","bands":[{"score":5,"threshold":5},{"score":4,"threshold":4},{"score":3,"threshold":3},{"score":2,"threshold":2},{"score":1,"threshold":1},{"score":0,"threshold":0}]}'::jsonb,
   40),
  ('training_attended',
   'Trainings Attended',
   'भाग ली गई ट्रेनिंग',
   'Trainings Attended in AY 25-26',
   'count',
   '{"direction":"higher_better","bands":[{"score":5,"threshold":5},{"score":4,"threshold":4},{"score":3,"threshold":3},{"score":2,"threshold":2},{"score":1,"threshold":1},{"score":0,"threshold":0}]}'::jsonb,
   50),
  ('fugitive_pm10',
   'Fugitive PM10 / AQI Non-Compliance Days',
   'फ्यूजिटिव PM10 / AQI गैर-अनुपालन दिन',
   'Fugitive PM10 / AQI non-compliance days in AY 25-26',
   'days',
   '{"direction":"lower_better","bands":[{"score":5,"threshold":0},{"score":4,"threshold":12},{"score":3,"threshold":24},{"score":2,"threshold":36},{"score":1,"threshold":48},{"score":0,"threshold":"gt:48"}]}'::jsonb,
   60),
  ('annual_production',
   'Annual Production Target vs Actual',
   'वार्षिक उत्पादन लक्ष्य बनाम वास्तविक',
   'Annual Production Target vs Actual (% achievement)',
   'percent',
   '{"direction":"higher_better","bands":[{"score":5,"threshold":100},{"score":4,"threshold":95},{"score":3,"threshold":90},{"score":2,"threshold":85},{"score":1,"threshold":80},{"score":0,"threshold":"lt:80"}]}'::jsonb,
   70),
  ('annual_pm',
   'Annual Preventive Maintenance Target vs Actual',
   'वार्षिक प्रिवेंटिव मेंटेनेंस लक्ष्य बनाम वास्तविक',
   'Annual PM Target vs Actual (% achievement)',
   'percent',
   '{"direction":"higher_better","bands":[{"score":5,"threshold":100},{"score":4,"threshold":95},{"score":3,"threshold":90},{"score":2,"threshold":85},{"score":1,"threshold":80},{"score":0,"threshold":"lt:80"}]}'::jsonb,
   80)
ON CONFLICT (key) DO NOTHING;
