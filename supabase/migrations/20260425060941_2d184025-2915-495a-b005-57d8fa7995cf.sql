CREATE OR REPLACE FUNCTION public.detect_training_needs_for_period(
  p_review_period text,
  p_review_year integer,
  p_threshold numeric DEFAULT 3.0
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_compliance INTEGER := 0;
  v_skill INTEGER := 0;
BEGIN
  -- PASS A: Compliance gaps (auto-zero / non-submission)
  INSERT INTO public.training_needs (
    employee_id, kpi_id, category_id, review_period, review_year,
    score, gap_type, priority, status, training_recommendation, identified_by
  )
  SELECT
    k.employee_id, k.id, k.category_id, k.review_period, k.review_year,
    rs.final_score,
    'compliance'::public.tni_gap_type,
    'high'::public.tni_priority,
    'identified'::public.tni_status,
    'Auto-flagged: non-submission / compliance penalty. No training required.',
    auth.uid()
  FROM public.kpis k
  JOIN public.review_submissions rs ON rs.kpi_id = k.id
  WHERE k.review_period = p_review_period
    AND k.review_year = p_review_year
    AND k.status = 'approved'
    AND rs.final_score IS NOT NULL
    AND rs.final_score < p_threshold
    AND (rs.self_score IS NULL OR rs.auto_advance_reason IS NOT NULL)
    AND NOT EXISTS (
      SELECT 1 FROM public.training_needs tn WHERE tn.kpi_id = k.id
    );
  GET DIAGNOSTICS v_compliance = ROW_COUNT;

  -- PASS B: Genuine skill gaps (employee submitted, scored low)
  INSERT INTO public.training_needs (
    employee_id, kpi_id, category_id, review_period, review_year,
    score, gap_type, priority, status, identified_by
  )
  SELECT
    k.employee_id, k.id, k.category_id, k.review_period, k.review_year,
    rs.final_score,
    'skill'::public.tni_gap_type,
    CASE
      WHEN rs.final_score < 2.0 THEN 'high'::public.tni_priority
      WHEN rs.final_score < 2.5 THEN 'medium'::public.tni_priority
      ELSE 'low'::public.tni_priority
    END,
    'identified'::public.tni_status,
    auth.uid()
  FROM public.kpis k
  JOIN public.review_submissions rs ON rs.kpi_id = k.id
  WHERE k.review_period = p_review_period
    AND k.review_year = p_review_year
    AND k.status = 'approved'
    AND rs.final_score IS NOT NULL
    AND rs.final_score < p_threshold
    AND rs.self_score IS NOT NULL
    AND rs.auto_advance_reason IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.training_needs tn WHERE tn.kpi_id = k.id
    );
  GET DIAGNOSTICS v_skill = ROW_COUNT;

  RETURN v_compliance + v_skill;
END;
$function$;