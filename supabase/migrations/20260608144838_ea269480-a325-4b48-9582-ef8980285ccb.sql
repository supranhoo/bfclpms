
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

  -- Map UI stage names to the tokens stored in get_employee_workflow(...)
  stage_token := CASE p_stage
    WHEN 'manager'             THEN 'manager_check'
    WHEN 'functional_manager'  THEN 'functional_manager_check'
    WHEN 'skip_level'          THEN 'skip_level_check'
    WHEN 'auditor'             THEN 'auditor_check'
    WHEN 'hr_pms'              THEN 'hr_pms_review'
    WHEN 'management'          THEN 'management_review'
    ELSE NULL
  END;
  IF stage_token IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH base AS (
    SELECT k.id AS kpi_id, k.employee_id
    FROM public.kpis k
    WHERE k.review_period = p_period
      AND k.review_year   = p_year
      AND k.employee_id IS NOT NULL
  ),
  staged AS (
    -- Only keep rows whose resolved workflow actually contains the requested stage.
    SELECT b.kpi_id, b.employee_id
    FROM base b
    WHERE EXISTS (
      SELECT 1
      FROM jsonb_array_elements_text(
        public.get_employee_workflow(b.employee_id, p_period, p_year)
      ) AS s(stage)
      WHERE s.stage = stage_token
    )
  )
  SELECT s.kpi_id, s.employee_id
  FROM staged s
  WHERE
    CASE p_stage
      WHEN 'auditor' THEN
        EXISTS (SELECT 1 FROM public.audit_kpi_assignments a
                 WHERE a.auditor_id = uid AND a.employee_id = s.employee_id)
        OR EXISTS (SELECT 1 FROM public.audit_kpi_level_assignments al
                    WHERE al.auditor_id = uid AND al.kpi_id = s.kpi_id)
      WHEN 'manager' THEN
        EXISTS (SELECT 1 FROM public.profiles p
                 WHERE p.id = s.employee_id AND p.reporting_manager_id = uid)
      WHEN 'functional_manager' THEN
        public.is_functional_manager_of(s.employee_id)
      WHEN 'skip_level' THEN
        public.get_skip_level_manager(s.employee_id) = uid
      WHEN 'hr_pms' THEN
        public.has_role(uid, 'hr_pms'::public.app_role)
      WHEN 'management' THEN
        public.has_role(uid, 'management'::public.app_role)
      ELSE FALSE
    END;
END;
$$;

GRANT EXECUTE ON FUNCTION public.my_review_scope(text, integer, text) TO authenticated;
