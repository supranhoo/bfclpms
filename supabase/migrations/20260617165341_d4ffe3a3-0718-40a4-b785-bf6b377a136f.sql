CREATE OR REPLACE FUNCTION public.stage_ready_kpis(p_period text, p_year integer, p_stage text)
RETURNS TABLE(kpi_id uuid, employee_id uuid)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  stage_token text;
BEGIN
  IF uid IS NULL OR p_period IS NULL OR p_year IS NULL OR p_stage IS NULL THEN
    RETURN;
  END IF;
  IF NOT public.has_role(uid, 'admin'::public.app_role) THEN
    RETURN;
  END IF;

  stage_token := CASE p_stage
    WHEN 'manager'             THEN 'manager_check'
    WHEN 'functional_manager'  THEN 'functional_manager_check'
    WHEN 'skip_level'          THEN 'skip_level_check'
    WHEN 'auditor'             THEN 'audit'
    WHEN 'hr_pms'              THEN 'hr_pms_review'
    WHEN 'management'          THEN 'management_review'
    ELSE NULL
  END;
  IF stage_token IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH base AS (
    SELECT
      k.id          AS kpi_id,
      k.employee_id,
      k.status::text AS kpi_status,
      public.get_employee_workflow(k.employee_id, p_period, p_year) AS wf
    FROM public.kpis k
    WHERE k.review_period = p_period
      AND k.review_year   = p_year
      AND k.employee_id IS NOT NULL
  ),
  staged AS (
    SELECT
      b.kpi_id,
      b.employee_id,
      b.kpi_status,
      stages.stage_text                AS this_stage,
      stages.idx                       AS this_idx,
      LAG(stages.stage_text) OVER (
        PARTITION BY b.kpi_id ORDER BY stages.idx
      )                                AS prev_stage
    FROM base b
    CROSS JOIN LATERAL (
      SELECT s.value::text AS stage_text, s.ordinality::int AS idx
      FROM jsonb_array_elements_text(b.wf) WITH ORDINALITY AS s(value, ordinality)
    ) AS stages
  )
  SELECT s.kpi_id, s.employee_id
  FROM staged s
  WHERE s.this_stage = stage_token
    AND s.prev_stage IS NOT NULL
    AND s.kpi_status = s.prev_stage;
END;
$$;

GRANT EXECUTE ON FUNCTION public.stage_ready_kpis(text, integer, text) TO authenticated;