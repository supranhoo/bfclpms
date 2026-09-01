DROP FUNCTION IF EXISTS public.bu_console_run_snapshot(text,integer,text,uuid,text,uuid[],uuid[],uuid[],uuid[],integer,integer);

CREATE OR REPLACE FUNCTION public.bu_console_run_snapshot(p_period text, p_year integer, p_stage text DEFAULT 'manager_check'::text, p_category_id uuid DEFAULT NULL::uuid, p_kra_name text DEFAULT NULL::text, p_bu_ids uuid[] DEFAULT NULL::uuid[], p_dept_ids uuid[] DEFAULT NULL::uuid[], p_division_ids uuid[] DEFAULT NULL::uuid[], p_manager_ids uuid[] DEFAULT NULL::uuid[], p_page integer DEFAULT 0, p_page_size integer DEFAULT 60, p_search text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_page int := GREATEST(COALESCE(p_page, 0), 0);
  v_size int := LEAST(GREATEST(COALESCE(p_page_size, 60), 1), 200);
  v_emp_total int := 0;
  v_kpi_total int := 0;
  v_cell_cap int := 25000;
  v_result jsonb;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT public.bu_console_can_read(v_user) THEN
    RETURN jsonb_build_object('authorized', false);
  END IF;

  WITH scope AS (
    SELECT k.id AS kpi_id, k.employee_id,
           COALESCE(k.category_id::text, '-') || '|' ||
             public.normalize_kpi_text(k.kra_name) || '|' ||
             public.normalize_kpi_text(COALESCE(NULLIF(btrim(k.kpi_title), ''), k.kpi_name)) AS kpi_key
    FROM public.kpis k
    JOIN public.profiles p ON p.id = k.employee_id AND p.is_active = true
    LEFT JOIN public.departments d ON d.id = p.department_id
    WHERE k.review_period = p_period
      AND k.review_year = p_year
      AND (p_category_id IS NULL OR k.category_id = p_category_id)
      AND (p_kra_name IS NULL OR public.normalize_kpi_text(k.kra_name) = public.normalize_kpi_text(p_kra_name))
      AND (p_bu_ids IS NULL OR array_length(p_bu_ids,1) IS NULL OR d.business_unit_id = ANY(p_bu_ids))
      AND (p_dept_ids IS NULL OR array_length(p_dept_ids,1) IS NULL OR p.department_id = ANY(p_dept_ids))
      AND (p_division_ids IS NULL OR array_length(p_division_ids,1) IS NULL
           OR d.business_unit_id IN (SELECT b2.id FROM public.business_units b2 WHERE b2.division_id = ANY(p_division_ids)))
      AND (p_manager_ids IS NULL OR array_length(p_manager_ids,1) IS NULL OR p.reporting_manager_id = ANY(p_manager_ids))
      AND (NULLIF(btrim(COALESCE(p_search,'')), '') IS NULL
           OR p.full_name ILIKE '%' || btrim(p_search) || '%'
           OR p.employee_code ILIKE '%' || btrim(p_search) || '%')
  )
  SELECT count(DISTINCT employee_id), count(DISTINCT kpi_key) INTO v_emp_total, v_kpi_total FROM scope;

  IF v_emp_total = 0 OR v_kpi_total = 0 THEN
    RETURN jsonb_build_object('authorized', true, 'stage', p_stage,
      'employee_total', v_emp_total, 'kpi_total', v_kpi_total,
      'page', v_page, 'page_size', v_size, 'capped', false,
      'can_write', public.bu_console_can_write(v_user),
      'employees', '[]'::jsonb, 'kpis', '[]'::jsonb, 'cells', '[]'::jsonb);
  END IF;

  IF v_kpi_total * LEAST(v_emp_total, v_size) > v_cell_cap THEN
    RETURN jsonb_build_object('authorized', true, 'stage', p_stage,
      'employee_total', v_emp_total, 'kpi_total', v_kpi_total,
      'page', v_page, 'page_size', v_size, 'capped', true,
      'can_write', public.bu_console_can_write(v_user),
      'employees', '[]'::jsonb, 'kpis', '[]'::jsonb, 'cells', '[]'::jsonb);
  END IF;

  WITH scope AS (
    SELECT k.id AS kpi_id, k.employee_id, p.full_name AS employee_name, p.employee_code,
           d.name AS department_name, bu.name AS business_unit_name,
           k.category_id, k.kra_name,
           COALESCE(NULLIF(btrim(k.kpi_title), ''), k.kpi_name) AS kpi_name,
           k.weightage, k.target_value::text AS target_value, k.uom, k.status::text AS status,
           COALESCE(k.category_id::text, '-') || '|' ||
             public.normalize_kpi_text(k.kra_name) || '|' ||
             public.normalize_kpi_text(COALESCE(NULLIF(btrim(k.kpi_title), ''), k.kpi_name)) AS kpi_key
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
      AND (p_manager_ids IS NULL OR array_length(p_manager_ids,1) IS NULL OR p.reporting_manager_id = ANY(p_manager_ids))
      AND (NULLIF(btrim(COALESCE(p_search,'')), '') IS NULL
           OR p.full_name ILIKE '%' || btrim(p_search) || '%'
           OR p.employee_code ILIKE '%' || btrim(p_search) || '%')
  ), emp AS (
    SELECT DISTINCT employee_id, employee_name, employee_code, department_name, business_unit_name
    FROM scope
    ORDER BY employee_name, employee_id
    LIMIT v_size OFFSET v_page * v_size
  ), emp_json AS (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'employee_id', employee_id, 'employee_name', employee_name,
      'employee_code', employee_code, 'department_name', department_name,
      'business_unit_name', business_unit_name) ORDER BY employee_name), '[]'::jsonb) AS j
    FROM emp
  ), kpi_rows AS (
    SELECT s.kpi_key, s.category_id, COALESCE(c.name, 'Uncategorised') AS category_name,
           min(s.kra_name) AS kra_name, min(s.kpi_name) AS kpi_name, min(s.uom) AS uom,
           count(DISTINCT s.employee_id) AS employee_count,
           count(DISTINCT COALESCE(s.target_value, '~')) AS target_variants,
           min(s.target_value) AS sample_target
    FROM scope s
    LEFT JOIN public.kra_categories c ON c.id = s.category_id
    GROUP BY s.kpi_key, s.category_id, c.name
  ), kpi_json AS (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'kpi_key', kpi_key, 'category_id', category_id, 'category_name', category_name,
      'kra_name', kra_name, 'kpi_name', kpi_name, 'uom', uom,
      'employee_count', employee_count, 'target_variants', target_variants,
      'sample_target', sample_target)
      ORDER BY category_name, kra_name, kpi_name), '[]'::jsonb) AS j
    FROM kpi_rows
  ), cell_json AS (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'kpi_key', s.kpi_key, 'kpi_id', s.kpi_id, 'employee_id', s.employee_id,
      'status', s.status, 'weightage', s.weightage, 'target_value', s.target_value,
      'is_na', COALESCE(rs.is_na, false), 'final_score', rs.final_score,
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
      'actionable', public.bu_console_kpi_actionable(v_user, s.kpi_id))), '[]'::jsonb) AS j
    FROM scope s
    JOIN emp e ON e.employee_id = s.employee_id
    LEFT JOIN public.review_submissions rs ON rs.kpi_id = s.kpi_id
  )
  SELECT jsonb_build_object(
    'authorized', true, 'stage', p_stage,
    'employee_total', v_emp_total, 'kpi_total', v_kpi_total,
    'page', v_page, 'page_size', v_size, 'capped', false,
    'can_write', public.bu_console_can_write(v_user),
    'employees', (SELECT j FROM emp_json),
    'kpis', (SELECT j FROM kpi_json),
    'cells', (SELECT j FROM cell_json))
  INTO v_result;

  RETURN v_result;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.bu_console_run_snapshot(text,integer,text,uuid,text,uuid[],uuid[],uuid[],uuid[],integer,integer,text) TO authenticated;