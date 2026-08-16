
CREATE OR REPLACE FUNCTION public.bu_console_run_snapshot(
  p_period text,
  p_year integer,
  p_stage text DEFAULT 'manager_check',
  p_category_id uuid DEFAULT NULL,
  p_kra_name text DEFAULT NULL,
  p_bu_ids uuid[] DEFAULT NULL,
  p_dept_ids uuid[] DEFAULT NULL,
  p_division_ids uuid[] DEFAULT NULL,
  p_manager_ids uuid[] DEFAULT NULL,
  p_page integer DEFAULT 0,
  p_page_size integer DEFAULT 60
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_page int := GREATEST(COALESCE(p_page, 0), 0);
  v_size int := LEAST(GREATEST(COALESCE(p_page_size, 60), 1), 200);
  v_emp_total int := 0;
  v_kpi_total int := 0;
  v_cell_cap int := 25000;
  v_employees jsonb := '[]'::jsonb;
  v_kpis jsonb := '[]'::jsonb;
  v_cells jsonb := '[]'::jsonb;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT public.bu_console_can_read(v_user) THEN
    RETURN jsonb_build_object('authorized', false);
  END IF;

  CREATE TEMP TABLE IF NOT EXISTS _run_scope (
    kpi_id uuid, employee_id uuid, employee_name text, employee_code text,
    department_name text, business_unit_name text,
    category_id uuid, kra_name text, kpi_name text, kpi_key text,
    weightage numeric, target_value text, uom text, status text
  ) ON COMMIT DROP;
  DELETE FROM _run_scope;

  INSERT INTO _run_scope
  SELECT k.id, k.employee_id, p.full_name, p.employee_code,
         d.name, bu.name,
         k.category_id, k.kra_name,
         COALESCE(NULLIF(btrim(k.kpi_title), ''), k.kpi_name),
         COALESCE(k.category_id::text, '-') || '|' ||
           public.normalize_kpi_text(k.kra_name) || '|' ||
           public.normalize_kpi_text(COALESCE(NULLIF(btrim(k.kpi_title), ''), k.kpi_name)),
         k.weightage, k.target_value::text, k.uom, k.status::text
  FROM public.kpis k
  JOIN public.profiles p ON p.id = k.employee_id AND p.is_active = true
  LEFT JOIN public.departments d ON d.id = p.department_id
  LEFT JOIN public.business_units bu ON bu.id = d.business_unit_id
  WHERE k.review_period = p_period
    AND k.review_year = p_year
    AND (p_category_id IS NULL OR k.category_id = p_category_id)
    AND (p_kra_name IS NULL OR public.normalize_kpi_text(k.kra_name) = public.normalize_kpi_text(p_kra_name))
    AND (p_bu_ids IS NULL OR array_length(p_bu_ids,1) IS NULL OR d.business_unit_id = ANY(p_bu_ids))
    AND (p_dept_ids IS NULL OR array_length(p_dept_ids,1) IS NULL OR p.department_id = ANY(p_dept_ids))
    AND (p_division_ids IS NULL OR array_length(p_division_ids,1) IS NULL
         OR d.business_unit_id IN (SELECT b2.id FROM public.business_units b2 WHERE b2.division_id = ANY(p_division_ids)))
    AND (p_manager_ids IS NULL OR array_length(p_manager_ids,1) IS NULL OR p.reporting_manager_id = ANY(p_manager_ids));

  SELECT count(DISTINCT employee_id), count(DISTINCT kpi_key) INTO v_emp_total, v_kpi_total FROM _run_scope;

  IF v_emp_total = 0 OR v_kpi_total = 0 THEN
    RETURN jsonb_build_object('authorized', true, 'stage', p_stage,
      'employee_total', v_emp_total, 'kpi_total', v_kpi_total,
      'page', v_page, 'page_size', v_size, 'capped', false,
      'employees', '[]'::jsonb, 'kpis', '[]'::jsonb, 'cells', '[]'::jsonb);
  END IF;

  IF v_kpi_total * LEAST(v_emp_total, v_size) > v_cell_cap THEN
    RETURN jsonb_build_object('authorized', true, 'stage', p_stage,
      'employee_total', v_emp_total, 'kpi_total', v_kpi_total,
      'page', v_page, 'page_size', v_size, 'capped', true,
      'employees', '[]'::jsonb, 'kpis', '[]'::jsonb, 'cells', '[]'::jsonb);
  END IF;

  CREATE TEMP TABLE IF NOT EXISTS _run_emp (
    employee_id uuid, employee_name text, employee_code text,
    department_name text, business_unit_name text
  ) ON COMMIT DROP;
  DELETE FROM _run_emp;

  INSERT INTO _run_emp
  SELECT DISTINCT employee_id, employee_name, employee_code, department_name, business_unit_name
  FROM _run_scope
  ORDER BY 2, 1
  LIMIT v_size OFFSET v_page * v_size;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'employee_id', e.employee_id, 'employee_name', e.employee_name,
    'employee_code', e.employee_code, 'department_name', e.department_name,
    'business_unit_name', e.business_unit_name) ORDER BY e.employee_name), '[]'::jsonb)
  INTO v_employees FROM _run_emp e;

  SELECT COALESCE(jsonb_agg(x ORDER BY x->>'category_name', x->>'kra_name', x->>'kpi_name'), '[]'::jsonb)
  INTO v_kpis
  FROM (
    SELECT jsonb_build_object(
      'kpi_key', s.kpi_key,
      'category_id', s.category_id,
      'category_name', COALESCE(c.name, 'Uncategorised'),
      'kra_name', min(s.kra_name),
      'kpi_name', min(s.kpi_name),
      'uom', min(s.uom),
      'employee_count', count(DISTINCT s.employee_id),
      'target_variants', count(DISTINCT COALESCE(s.target_value, '~')),
      'sample_target', min(s.target_value)
    ) AS x
    FROM _run_scope s
    LEFT JOIN public.kra_categories c ON c.id = s.category_id
    GROUP BY s.kpi_key, s.category_id, c.name
  ) q;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'kpi_key', s.kpi_key,
    'kpi_id', s.kpi_id,
    'employee_id', s.employee_id,
    'status', s.status,
    'weightage', s.weightage,
    'target_value', s.target_value,
    'is_na', COALESCE(rs.is_na, false),
    'final_score', rs.final_score,
    'achieved_value', COALESCE(rs.management_achieved_value, rs.auditor_achieved_value,
                               rs.hr_pms_achieved_value, rs.skip_level_achieved_value,
                               rs.manager_achieved_value, rs.self_achieved_value, rs.achieved_value),
    'stage_score', CASE p_stage
        WHEN 'self_review' THEN rs.self_score
        WHEN 'manager_check' THEN rs.manager_score
        WHEN 'functional_manager_check' THEN rs.functional_manager_score
        WHEN 'skip_level_check' THEN rs.skip_level_score
        WHEN 'hr_pms_review' THEN rs.hr_pms_score
        WHEN 'audit' THEN rs.auditor_score
        WHEN 'management_review' THEN rs.management_score
        ELSE rs.final_score END,
    'actionable', public.bu_console_kpi_actionable(v_user, s.kpi_id)
  )), '[]'::jsonb)
  INTO v_cells
  FROM _run_scope s
  JOIN _run_emp e ON e.employee_id = s.employee_id
  LEFT JOIN public.review_submissions rs ON rs.kpi_id = s.kpi_id;

  RETURN jsonb_build_object(
    'authorized', true, 'stage', p_stage,
    'employee_total', v_emp_total, 'kpi_total', v_kpi_total,
    'page', v_page, 'page_size', v_size, 'capped', false,
    'can_write', public.bu_console_can_write(v_user),
    'employees', v_employees, 'kpis', v_kpis, 'cells', v_cells);
END;
$function$;

REVOKE ALL ON FUNCTION public.bu_console_run_snapshot(text,integer,text,uuid,text,uuid[],uuid[],uuid[],uuid[],integer,integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bu_console_run_snapshot(text,integer,text,uuid,text,uuid[],uuid[],uuid[],uuid[],integer,integer) TO authenticated;
