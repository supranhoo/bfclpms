CREATE OR REPLACE FUNCTION public.bu_console_kpi_detail(p_category_id uuid, p_kra_name text, p_kpi_name text, p_period text, p_year integer, p_bu_ids uuid[] DEFAULT NULL::uuid[], p_dept_ids uuid[] DEFAULT NULL::uuid[], p_division_ids uuid[] DEFAULT NULL::uuid[], p_manager_ids uuid[] DEFAULT NULL::uuid[], p_page integer DEFAULT 1, p_page_size integer DEFAULT 200, p_title_key text DEFAULT NULL::text, p_variant_key text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    SELECT k.id AS kpi_id,
           k.employee_id,
           k.weightage,
           k.target_value,
           k.uom,
           COALESCE(NULLIF(btrim(k.uom_type), ''), 'numeric') AS uom_type,
           k.qualitative_options,
           k.frequency,
           k.status::text AS status,
           k.criteria,
           k.source_of_data,
           k.category_id,
           k.kra_name,
           k.r0, k.r1, k.r2, k.r3, k.r4, k.r5,
           k.is_org_level,
           k.kpi_name,
           k.kpi_title,
           k.kpi_description,
           k.kpi_formula,
           k.kpi_scoring_logic,
           public.bu_console_variant_key(k.kpi_description, k.kpi_formula, k.kpi_scoring_logic, k.target_value) AS variant_key,
           p.full_name,
           p.employee_code,
           p.department_id,
           d.name AS department_name,
           d.business_unit_id AS business_unit_id,
           bu.name AS business_unit_name
    FROM public.kpis k
    JOIN public.profiles p ON p.id = k.employee_id AND p.is_active = true
    LEFT JOIN public.departments d ON d.id = p.department_id
    LEFT JOIN public.business_units bu ON bu.id = d.business_unit_id
    WHERE k.review_period = p_period
      AND k.review_year = p_year
      AND (p_category_id IS NULL OR k.category_id = p_category_id)
      AND public.normalize_kpi_text(k.kra_name) = public.normalize_kpi_text(p_kra_name)
      AND (
        CASE WHEN p_title_key IS NOT NULL
          THEN public.normalize_kpi_text(COALESCE(NULLIF(btrim(k.kpi_title), ''), k.kpi_name)) = p_title_key
          ELSE public.normalize_kpi_text(k.kpi_name) = public.normalize_kpi_text(p_kpi_name)
        END
      )
      AND (p_variant_key IS NULL OR public.bu_console_variant_key(k.kpi_description, k.kpi_formula, k.kpi_scoring_logic, k.target_value) = p_variant_key)
      AND (p_bu_ids IS NULL OR array_length(p_bu_ids,1) IS NULL OR d.business_unit_id = ANY(p_bu_ids))
      AND (p_dept_ids IS NULL OR array_length(p_dept_ids,1) IS NULL OR p.department_id = ANY(p_dept_ids))
      AND (p_division_ids IS NULL OR array_length(p_division_ids,1) IS NULL OR d.business_unit_id IN (SELECT bu_f.id FROM public.business_units bu_f WHERE bu_f.division_id = ANY(p_division_ids)))
      AND (p_manager_ids IS NULL OR array_length(p_manager_ids,1) IS NULL OR p.reporting_manager_id = ANY(p_manager_ids))
  ),
  counted AS (SELECT count(*)::int AS total FROM scoped),
  page AS (
    SELECT s.*, rs.achieved_value, rs.self_achieved_value, rs.final_score, rs.final_rating,
           rs.self_score, rs.manager_score, rs.is_na
    FROM scoped s
    LEFT JOIN public.review_submissions rs ON rs.kpi_id = s.kpi_id
    ORDER BY s.full_name
    OFFSET v_offset LIMIT v_size
  )
  SELECT (SELECT total FROM counted),
         COALESCE((SELECT jsonb_agg(jsonb_build_object(
            'kpi_id', kpi_id,
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
            'uom_type', uom_type,
            'qualitative_options', qualitative_options,
            'frequency', frequency,
            'criteria', criteria,
            'source_of_data', source_of_data,
            'r0', r0, 'r1', r1, 'r2', r2, 'r3', r3, 'r4', r4, 'r5', r5,
            'status', status,
            'is_na', is_na,
            'variant_key', variant_key,
            'kpi_title', kpi_title,
            'kpi_description', kpi_description,
            'kpi_formula', kpi_formula,
            'kpi_scoring_logic', kpi_scoring_logic,
            'achieved_value', COALESCE(achieved_value, self_achieved_value),
            'self_score', self_score,
            'manager_score', manager_score,
            'final_score', final_score,
            'final_rating', final_rating
         )) FROM page), '[]'::jsonb),
         COALESCE((SELECT jsonb_build_object(
            'criteria', max(criteria), 'uom', max(uom), 'frequency', max(frequency),
            'source_of_data', max(source_of_data),
            'category_id', (array_agg(category_id) FILTER (WHERE category_id IS NOT NULL))[1],
            'kra_name', max(kra_name),
            'target_value', max(target_value),
            'r0', max(r0),'r1', max(r1),'r2', max(r2),'r3', max(r3),'r4', max(r4),'r5', max(r5),
            'kpi_title', max(kpi_title),
            'kpi_description', max(kpi_description),
            'kpi_formula', max(kpi_formula),
            'kpi_scoring_logic', max(kpi_scoring_logic),
            'kpi_name', max(kpi_name),
            'uom_type', (array_agg(uom_type ORDER BY uom_type))[1],
            'uom_types', to_jsonb(array_agg(DISTINCT uom_type)),
            'qualitative_options', (array_agg(qualitative_options) FILTER (WHERE qualitative_options IS NOT NULL))[1],
            'variant_count', count(DISTINCT variant_key)::int,
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
$function$;