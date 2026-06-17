CREATE OR REPLACE FUNCTION public.my_review_scope(
  p_period text,
  p_year   integer,
  p_stage  text
)
RETURNS TABLE(kpi_id uuid, employee_id uuid)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  stage_token text;
BEGIN
  IF uid IS NULL OR p_period IS NULL OR p_year IS NULL OR p_stage IS NULL THEN
    RETURN;
  END IF;

  -- Map UI stage names to the tokens stored in workflow_templates.stages
  -- (canonical workflow tokens; NOT the workflow_step assignment tokens).
  -- NOTE: 'audit' here matches workflow stage; status column also uses 'audit'.
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
      k.status      AS kpi_status,
      public.get_employee_workflow(k.employee_id, p_period, p_year) AS wf
    FROM public.kpis k
    WHERE k.review_period = p_period
      AND k.review_year   = p_year
      AND k.employee_id IS NOT NULL
  ),
  staged AS (
    -- Resolve the position of the requested stage in the workflow and the
    -- predecessor stage (= the status the KPI must currently be in for the
    -- row to be "ready" for this reviewer). Status convention is
    -- "last COMPLETED stage", so kpis.status MUST equal prev_stage.
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
  ),
  ready AS (
    -- Only rows whose workflow contains the requested stage AND whose
    -- current status equals the immediately preceding stage are
    -- "actionable" for this viewer stage. First-stage rows (no prev) are
    -- excluded — reviewer stages always have a predecessor.
    SELECT s.kpi_id, s.employee_id
    FROM staged s
    WHERE s.this_stage = stage_token
      AND s.prev_stage IS NOT NULL
      AND s.kpi_status = s.prev_stage
  )
  SELECT r.kpi_id, r.employee_id
  FROM ready r
  WHERE
    CASE p_stage
      WHEN 'auditor' THEN
        EXISTS (SELECT 1 FROM public.audit_kpi_assignments a
                 WHERE a.auditor_id = uid AND a.employee_id = r.employee_id)
        OR EXISTS (SELECT 1 FROM public.audit_kpi_level_assignments al
                    WHERE al.auditor_id = uid AND al.kpi_id = r.kpi_id)
      WHEN 'manager' THEN
        EXISTS (SELECT 1 FROM public.profiles p
                 WHERE p.id = r.employee_id AND p.reporting_manager_id = uid)
      WHEN 'functional_manager' THEN
        public.is_functional_manager_of(r.employee_id)
      WHEN 'skip_level' THEN
        public.get_skip_level_manager(r.employee_id) = uid
      WHEN 'hr_pms' THEN
        public.has_role(uid, 'hr_pms'::public.app_role)
      WHEN 'management' THEN
        public.has_role(uid, 'management'::public.app_role)
      ELSE FALSE
    END;
END;
$$;

GRANT EXECUTE ON FUNCTION public.my_review_scope(text, integer, text) TO authenticated;