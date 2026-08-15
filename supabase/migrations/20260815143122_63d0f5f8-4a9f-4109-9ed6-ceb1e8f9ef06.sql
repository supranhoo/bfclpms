CREATE OR REPLACE FUNCTION public.bu_console_kpi_detail(
  p_category_id uuid,
  p_kra_name text,
  p_kpi_name text,
  p_period text,
  p_year integer,
  p_bu_ids uuid[] DEFAULT NULL,
  p_dept_ids uuid[] DEFAULT NULL,
  p_page integer DEFAULT 1,
  p_page_size integer DEFAULT 200
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rows jsonb;
  v_total integer;
  v_size integer := LEAST(GREATEST(COALESCE(p_page_size,200),1),200);
  v_offset integer := (GREATEST(COALESCE(p_page,1),1) - 1) * v_size;
  v_meta jsonb;
BEGIN
  IF NOT public.bu_console_can_read(auth.uid()) THEN
    RETURN jsonb_build_object('authorized', false, 'rows', '[]'::jsonb, 'total', 0);
  END IF;

  WITH scoped AS (
    SELECT k.*, p.full_name, p.employee_code, p.department_id, d.name AS department_name,
           d.business_unit_id, bu.name AS business_unit_name
    FROM public.kpis k
    JOIN public.profiles p ON p.id = k.employee_id AND p.is_active = true
    LEFT JOIN public.departments d ON d.id = p.department_id
    LEFT JOIN public.business_units bu ON bu.id = d.business_unit_id
    WHERE k.review_period = p_period
      AND k.review_year = p_year
      AND (p_category_id IS NULL OR k.category_id = p_category_id)
      AND normalize_kpi_text(k.kra_name) = normalize_kpi_text(p_kra_name)
      AND normalize_kpi_text(k.kpi_name) = normalize_kpi_text(p_kpi_name)
      AND (p_bu_ids IS NULL OR array_length(p_bu_ids,1) IS NULL OR d.business_unit_id = ANY(p_bu_ids))
      AND (p_dept_ids IS NULL OR array_length(p_dept_ids,1) IS NULL OR p.department_id = ANY(p_dept_ids))
  ),
  counted AS (SELECT count(*)::int AS total FROM scoped),
  page AS (
    SELECT s.*, rs.achieved_value, rs.self_achieved_value, rs.final_score, rs.final_rating,
           rs.self_score, rs.manager_score, rs.is_na
    FROM scoped s
    LEFT JOIN public.review_submissions rs ON rs.kpi_id = s.id
    ORDER BY s.full_name
    OFFSET v_offset LIMIT v_size
  )
  SELECT (SELECT total FROM counted),
         COALESCE((SELECT jsonb_agg(jsonb_build_object(
            'kpi_id', id,
            'employee_id', employee_id,
            'employee_name', full_name,
            'employee_code', employee_code,
            'department_id', department_id,
            'department_name', department_name,
            'business_unit_id', business_unit_id,
            'business_unit_name', business_unit_name,
            'weightage', weightage,
            'target_value', target_value,
            'uom', uom,
            'frequency', frequency,
            'status', status,
            'is_na', is_na,
            'achieved_value', COALESCE(achieved_value, self_achieved_value),
            'self_score', self_score,
            'manager_score', manager_score,
            'final_score', final_score,
            'final_rating', final_rating
         )) FROM page), '[]'::jsonb),
         COALESCE((SELECT jsonb_build_object(
            'criteria', max(criteria), 'uom', max(uom), 'frequency', max(frequency),
            'r0', max(r0),'r1', max(r1),'r2', max(r2),'r3', max(r3),'r4', max(r4),'r5', max(r5),
            'is_org_level', bool_or(COALESCE(is_org_level,false))
         ) FROM scoped), '{}'::jsonb)
  INTO v_total, v_rows, v_meta;

  RETURN jsonb_build_object(
    'authorized', true,
    'total', COALESCE(v_total,0),
    'page', GREATEST(COALESCE(p_page,1),1),
    'page_size', v_size,
    'definition', v_meta,
    'rows', v_rows
  );
END;
$$;