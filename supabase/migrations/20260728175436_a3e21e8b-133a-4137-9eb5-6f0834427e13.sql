CREATE OR REPLACE FUNCTION public.annual_review_unscored_stage_diagnostic(p_cycle_id uuid DEFAULT NULL)
RETURNS TABLE (
  instance_id uuid,
  cycle_id uuid,
  employee_id uuid,
  employee_code text,
  employee_name text,
  stage text,
  reviewer_id uuid,
  reviewer_name text,
  overall_status text,
  is_locked boolean,
  submitted_at timestamptz,
  has_recommendation boolean,
  scoreable_criteria integer,
  classification text,
  sweep_touched boolean,
  response_updated_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    r.instance_id,
    i.cycle_id,
    i.employee_id,
    e.employee_code,
    e.full_name,
    r.reviewer_role::text,
    r.reviewer_id,
    rv.full_name,
    i.overall_status::text,
    r.is_locked,
    r.submitted_at,
    (r.qualitative_responses ? '__overall_recommendation'),
    public.annual_review_stage_scoreable_criteria_count(r.instance_id, r.reviewer_role),
    CASE
      WHEN public.annual_review_stage_scoreable_criteria_count(r.instance_id, r.reviewer_role) > 0
        THEN 'unscored'
      ELSE 'narrative_only'
    END,
    EXISTS (
      SELECT 1 FROM public.annual_review_empty_stage_repair_2026_07 s
       WHERE s.instance_id = r.instance_id
         AND s.reviewer_role = r.reviewer_role
    ),
    r.updated_at
  FROM public.annual_review_responses r
  JOIN public.annual_review_instances i ON i.id = r.instance_id
  JOIN public.profiles e ON e.id = i.employee_id
  LEFT JOIN public.profiles rv ON rv.id = r.reviewer_id
  WHERE (p_cycle_id IS NULL OR i.cycle_id = p_cycle_id)
    AND i.overall_status <> 'excluded'
    AND COALESCE(jsonb_typeof(r.criteria_scores), 'null') <> 'object'
        OR (p_cycle_id IS NULL OR i.cycle_id = p_cycle_id)
       AND i.overall_status <> 'excluded'
       AND r.criteria_scores = '{}'::jsonb
$$;

-- Replace the accidental precedence above with an explicit, correct predicate.
CREATE OR REPLACE FUNCTION public.annual_review_unscored_stage_diagnostic(p_cycle_id uuid DEFAULT NULL)
RETURNS TABLE (
  instance_id uuid,
  cycle_id uuid,
  employee_id uuid,
  employee_code text,
  employee_name text,
  stage text,
  reviewer_id uuid,
  reviewer_name text,
  overall_status text,
  is_locked boolean,
  submitted_at timestamptz,
  has_recommendation boolean,
  scoreable_criteria integer,
  classification text,
  sweep_touched boolean,
  response_updated_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    r.instance_id,
    i.cycle_id,
    i.employee_id,
    e.employee_code,
    e.full_name,
    r.reviewer_role::text,
    r.reviewer_id,
    rv.full_name,
    i.overall_status::text,
    r.is_locked,
    r.submitted_at,
    (r.qualitative_responses ? '__overall_recommendation'),
    public.annual_review_stage_scoreable_criteria_count(r.instance_id, r.reviewer_role),
    CASE
      WHEN public.annual_review_stage_scoreable_criteria_count(r.instance_id, r.reviewer_role) > 0
        THEN 'unscored'
      ELSE 'narrative_only'
    END,
    EXISTS (
      SELECT 1 FROM public.annual_review_empty_stage_repair_2026_07 s
       WHERE s.instance_id = r.instance_id
         AND s.reviewer_role = r.reviewer_role
    ),
    r.updated_at
  FROM public.annual_review_responses r
  JOIN public.annual_review_instances i ON i.id = r.instance_id
  JOIN public.profiles e ON e.id = i.employee_id
  LEFT JOIN public.profiles rv ON rv.id = r.reviewer_id
  WHERE (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'hr_pms'))
    AND (p_cycle_id IS NULL OR i.cycle_id = p_cycle_id)
    AND i.overall_status <> 'excluded'
    AND COALESCE(r.criteria_scores, '{}'::jsonb) = '{}'::jsonb
$$;

REVOKE ALL ON FUNCTION public.annual_review_unscored_stage_diagnostic(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.annual_review_unscored_stage_diagnostic(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.annual_review_unscored_stage_diagnostic(uuid) IS
'ADR-197 / POLICY §AR-STAGE-SUBMIT-SCORE-COMPLETENESS. Read-only. Lists reviewer stages holding a response with no criteria scores, classified as narrative_only (template has 0 scoreable criteria for that stage - blank is correct) or unscored (template requires scores - stage must be re-scored). Admin / hr_pms only.';