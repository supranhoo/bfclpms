ALTER TABLE public.annual_review_assignment_rules
  ADD COLUMN IF NOT EXISTS archetype_code text
    CHECK (archetype_code IS NULL OR archetype_code IN ('A','B','C','D')),
  ADD COLUMN IF NOT EXISTS grade_bucket text
    CHECK (grade_bucket IS NULL OR grade_bucket IN ('M','W','T','other')),
  ADD COLUMN IF NOT EXISTS requires_kra_in_ay boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS min_kra_months_in_ay integer NOT NULL DEFAULT 1
    CHECK (min_kra_months_in_ay >= 0 AND min_kra_months_in_ay <= 12);

CREATE INDEX IF NOT EXISTS idx_arar_archetype_grade
  ON public.annual_review_assignment_rules (archetype_code, grade_bucket);

COMMENT ON COLUMN public.annual_review_assignment_rules.archetype_code IS
  'Template Factory archetype (A=KRA-based, B=no-KRA M-grade, C=no-KRA W-grade, D=no-KRA T/other).';
COMMENT ON COLUMN public.annual_review_assignment_rules.grade_bucket IS
  'Grade family bucket for weight-matrix resolution (M/W/T/other).';
COMMENT ON COLUMN public.annual_review_assignment_rules.requires_kra_in_ay IS
  'When true, rule matches only employees with active KRAs in the assessment year.';
COMMENT ON COLUMN public.annual_review_assignment_rules.min_kra_months_in_ay IS
  'Minimum months of KRAs required in the AY when requires_kra_in_ay = true.';