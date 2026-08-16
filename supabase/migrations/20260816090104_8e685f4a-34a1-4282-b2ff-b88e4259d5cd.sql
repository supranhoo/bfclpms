CREATE OR REPLACE FUNCTION public.bu_console_pipeline(
  p_period text,
  p_year integer,
  p_bu_ids uuid[] DEFAULT NULL::uuid[],
  p_dept_ids uuid[] DEFAULT NULL::uuid[],
  p_division_ids uuid[] DEFAULT NULL::uuid[],
  p_manager_ids uuid[] DEFAULT NULL::uuid[],
  p_stage text DEFAULT NULL::text,
  p_page integer DEFAULT 1,
  p_page_size integer DEFAULT 50
) RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_limit  integer := LEAST(GREATEST(COALESCE(p_page_size, 50), 1), 200);
  v_offset integer := GREATEST(COALESCE(p_page, 1) - 1, 0) * v_limit;
  v_result jsonb;
BEGIN
  IF NOT public.bu_console_can_read(auth.uid()) THEN
    RETURN jsonb_build_object('authorized', false, 'stages', '[]'::jsonb, 'rows', '[]'::jsonb, 'total', 0);
  END IF;

  WITH scoped AS (
    SELECT k.id AS kpi_id,
           k.employee_id,
           k.status::text AS status,
           k.updated_at,
           p.full_name,
           p.employee_code,
           d.name AS department_name
    FROM public.kpis k
    JOIN public.profiles p ON p.id = k.employee_id AND p.is_active = true
    LEFT JOIN public.departments d ON d.id = p.department_id
    WHERE k.review_period = p_period
      AND k.review_year = p_year
      AND (p_bu_ids IS NULL OR array_length(p_bu_ids,1) IS NULL OR d.business_unit_id = ANY(p_bu_ids))
      AND (p_dept_ids IS NULL OR array_length(p_dept_ids,1) IS NULL OR p.department_id = ANY(p_dept_ids))
      AND (p_division_ids IS NULL OR array_length(p_division_ids,1) IS NULL
           OR d.business_unit_id IN (SELECT bu_f.id FROM public.business_units bu_f WHERE bu_f.division_id = ANY(p_division_ids)))
      AND (p_manager_ids IS NULL OR array_length(p_manager_ids,1) IS NULL OR p.reporting_manager_id = ANY(p_manager_ids))
  ),
  emp AS (SELECT DISTINCT employee_id FROM scoped),
  wf AS (
    SELECT w.employee_id, w.stages
    FROM public.get_bulk_employee_workflows(
      (SELECT COALESCE(array_agg(employee_id), ARRAY[]::uuid[]) FROM emp), p_period, p_year
    ) w
  ),
  resolved AS (
    SELECT s.*,
           CASE
             -- Terminal state.
             WHEN s.status = 'approved' THEN 'approved'
             -- Active-stage statuses: the item IS with that reviewer
             -- (SSOT parity with src/lib/bottleneckResolver.ts).
             WHEN s.status IN ('audit','management_review','hr_pms_review',
                               'skip_level_check','functional_manager_check') THEN s.status
             -- Initial state: the employee owes a self review.
             WHEN s.status = 'kra_set' THEN 'self_review'
             WHEN w.stages IS NULL OR array_length(w.stages, 1) IS NULL THEN 'self_review'
             WHEN COALESCE(array_position(w.stages, s.status), 0) = 0 THEN s.status
             -- Next stage in the resolved chain; if that is 'approved', the
             -- current reviewer is the terminal actor and still owns it.
             WHEN COALESCE(w.stages[array_position(w.stages, s.status) + 1], 'approved') = 'approved'
               THEN s.status
             ELSE w.stages[array_position(w.stages, s.status) + 1]
           END AS pending_stage
    FROM scoped s
    LEFT JOIN wf w ON w.employee_id = s.employee_id
  ),
  stage_agg AS (
    SELECT pending_stage AS stage,
           count(*)::int AS kpi_count,
           count(DISTINCT employee_id)::int AS employee_count
    FROM resolved
    GROUP BY pending_stage
  ),
  emp_rows AS (
    SELECT employee_id,
           max(full_name) AS employee_name,
           max(employee_code) AS employee_code,
           max(department_name) AS department_name,
           count(*) FILTER (WHERE pending_stage <> 'approved')::int AS pending_kpis,
           count(*)::int AS total_kpis,
           max(updated_at) AS last_activity_at,
           (array_agg(pending_stage ORDER BY (pending_stage = 'approved'), pending_stage))[1] AS pending_stage
    FROM resolved
    WHERE p_stage IS NULL OR pending_stage = p_stage
    GROUP BY employee_id
  ),
  counted AS (SELECT count(*)::int AS total FROM emp_rows)
  SELECT jsonb_build_object(
    'authorized', true,
    'period', p_period,
    'year', p_year,
    'stage', p_stage,
    'page', GREATEST(COALESCE(p_page, 1), 1),
    'page_size', v_limit,
    'total', (SELECT total FROM counted),
    'employee_total', (SELECT count(*)::int FROM emp),
    'stages', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'stage', stage,
               'kpi_count', kpi_count,
               'employee_count', employee_count
             ) ORDER BY stage)
      FROM stage_agg
    ), '[]'::jsonb),
    'rows', COALESCE((
      SELECT jsonb_agg(r.payload ORDER BY r.pending_kpis DESC, r.employee_name)
      FROM (
        SELECT jsonb_build_object(
                 'employee_id', employee_id,
                 'employee_name', employee_name,
                 'employee_code', employee_code,
                 'department_name', department_name,
                 'pending_stage', pending_stage,
                 'pending_kpis', pending_kpis,
                 'total_kpis', total_kpis,
                 'last_activity_at', last_activity_at
               ) AS payload,
               pending_kpis, employee_name
        FROM emp_rows
        ORDER BY pending_kpis DESC, employee_name
        OFFSET v_offset LIMIT v_limit
      ) r
    ), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.bu_console_pipeline(text, integer, uuid[], uuid[], uuid[], uuid[], text, integer, integer) TO authenticated;