
ALTER TABLE public.annual_review_criteria_assignments
  ADD COLUMN grade_code TEXT NULL
    CHECK (grade_code IS NULL OR length(grade_code) BETWEEN 1 AND 32);

DROP INDEX IF EXISTS public.annual_review_criteria_assignments_uk;
DROP INDEX IF EXISTS public.annual_review_criteria_assignments_lookup;

CREATE UNIQUE INDEX annual_review_criteria_assignments_uk
  ON public.annual_review_criteria_assignments (
    criterion_id,
    COALESCE(archetype_code, ''),
    COALESCE(grade_bucket, ''),
    COALESCE(grade_code, ''),
    COALESCE(department_id::text, ''),
    COALESCE(sub_unit_id::text, '')
  );

CREATE INDEX annual_review_criteria_assignments_lookup
  ON public.annual_review_criteria_assignments
     (archetype_code, grade_bucket, grade_code, department_id, sub_unit_id);
