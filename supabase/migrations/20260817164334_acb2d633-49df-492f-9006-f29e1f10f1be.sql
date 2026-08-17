CREATE OR REPLACE FUNCTION public.bu_console_tree(p_period text, p_year integer, p_bu_ids uuid[] DEFAULT NULL::uuid[], p_dept_ids uuid[] DEFAULT NULL::uuid[], p_division_ids uuid[] DEFAULT NULL::uuid[], p_manager_ids uuid[] DEFAULT NULL::uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_result jsonb;
BEGIN
  IF NOT public.bu_console_can_read(auth.uid()) THEN
    RETURN jsonb_build_object('authorized', false, 'categories', '[]'::jsonb);
  END IF;

  WITH scoped AS (
    SELECT k.id,
           k.category_id,
           k.kra_name,
           k.kpi_name,
           k.kpi_title,
           k.kpi_description,
           k.kpi_formula,
           k.kpi_scoring_logic,
           k.employee_id,
           k.is_org_level,
           k.weightage,
           k.target_value,
           k.uom,
           NULLIF(btrim(k.frequency), '') AS frequency,
           NULLIF(btrim(k.frequency_cycle_start), '') AS frequency_cycle_start,
           COALESCE(NULLIF(btrim(k.uom_type), ''), 'numeric') AS uom_type,
           k.qualitative_options,
           public.normalize_kpi_text(k.kra_name) AS kra_key,
           public.normalize_kpi_text(COALESCE(NULLIF(btrim(k.kpi_title), ''), k.kpi_name)) AS title_key,
           public.bu_console_variant_key(k.kpi_description, k.kpi_formula, k.kpi_scoring_logic, k.target_value) AS variant_key,
           COALESCE(rs.final_score, rs.management_score, rs.hr_pms_score, rs.skip_level_score,
                    rs.auditor_score, rs.functional_manager_score, rs.manager_score, rs.self_score) AS score
    FROM public.kpis k
    JOIN public.profiles p ON p.id = k.employee_id AND p.is_active = true
    LEFT JOIN public.departments d ON d.id = p.department_id
    LEFT JOIN public.review_submissions rs ON rs.kpi_id = k.id AND COALESCE(rs.is_na, false) = false
    WHERE k.review_period = p_period
      AND k.review_year = p_year
      AND (p_bu_ids IS NULL OR array_length(p_bu_ids,1) IS NULL OR d.business_unit_id = ANY(p_bu_ids))
      AND (p_dept_ids IS NULL OR array_length(p_dept_ids,1) IS NULL OR p.department_id = ANY(p_dept_ids))
      AND (p_division_ids IS NULL OR array_length(p_division_ids,1) IS NULL OR d.business_unit_id IN (SELECT bu_f.id FROM public.business_units bu_f WHERE bu_f.division_id = ANY(p_division_ids)))
      AND (p_manager_ids IS NULL OR array_length(p_manager_ids,1) IS NULL OR p.reporting_manager_id = ANY(p_manager_ids))
  ),
  variant_level AS (
    SELECT category_id, kra_key, title_key, variant_key,
           max(kra_name) AS kra_name,
           max(COALESCE(NULLIF(btrim(kpi_title), ''), kpi_name)) AS title,
           max(kpi_description) AS description,
           max(kpi_formula) AS formula,
           max(kpi_scoring_logic) AS scoring_logic,
           max(target_value) AS target_value,
           max(uom) AS uom,
           (array_agg(uom_type ORDER BY uom_type))[1] AS uom_type,
           array_agg(DISTINCT uom_type) AS uom_types,
           (array_agg(qualitative_options) FILTER (WHERE qualitative_options IS NOT NULL))[1] AS qualitative_options,
           count(*)::int AS kpi_rows,
           count(DISTINCT employee_id)::int AS employee_count,
           bool_or(COALESCE(is_org_level,false)) AS is_org_level,
           bool_or(NULLIF(btrim(kpi_title), '') IS NOT NULL) AS is_structured,
           array_agg(DISTINCT kpi_name) AS kpi_names,
           avg(score) AS avg_score
    FROM scoped
    GROUP BY category_id, kra_key, title_key, variant_key
  ),
  title_level AS (
    SELECT category_id, kra_key, title_key,
           count(DISTINCT variant_key)::int AS variant_count,
           count(*)::int AS kpi_rows_x,
           array_remove(array_agg(DISTINCT weightage), NULL) AS weightage_values,
           array_agg(DISTINCT uom_type) AS uom_types,
           -- ADR-294: frequency + cycle anchor drive the "due this month" badge.
           array_remove(array_agg(DISTINCT frequency), NULL) AS frequencies,
           array_remove(array_agg(DISTINCT frequency_cycle_start), NULL) AS frequency_cycle_starts,
           avg(score) AS avg_score,
           count(DISTINCT employee_id)::int AS employee_count,
           count(*)::int AS kpi_rows
    FROM scoped
    GROUP BY category_id, kra_key, title_key
  ),
  kpi_level AS (
    SELECT v.category_id,
           v.kra_key,
           max(v.kra_name) AS kra_name,
           v.title_key,
           max(v.title) AS kpi_title,
           max(v.description) AS kpi_description,
           (array_agg(v.kpi_names[1] ORDER BY v.kpi_rows DESC))[1] AS kpi_name,
           t.kpi_rows,
           t.employee_count,
           t.variant_count,
           t.weightage_values,
           t.uom_types,
           t.frequencies,
           t.frequency_cycle_starts,
           t.avg_score,
           bool_or(v.is_org_level) AS is_org_level,
           bool_or(v.is_structured) AS is_structured,
           jsonb_agg(jsonb_build_object(
             'variant_key', v.variant_key,
             'kpi_name', v.kpi_names[1],
             'kpi_names', to_jsonb(v.kpi_names),
             'description', v.description,
             'formula', v.formula,
             'scoring_logic', v.scoring_logic,
             'target_value', v.target_value,
             'uom', v.uom,
             'uom_type', v.uom_type,
             'uom_types', to_jsonb(v.uom_types),
             'qualitative_options', v.qualitative_options,
             'kpi_rows', v.kpi_rows,
             'employee_count', v.employee_count,
             'avg_score', round(v.avg_score, 2)
           ) ORDER BY v.employee_count DESC, v.variant_key) AS variants
    FROM variant_level v
    JOIN title_level t
      ON t.category_id IS NOT DISTINCT FROM v.category_id
     AND t.kra_key = v.kra_key
     AND t.title_key = v.title_key
    GROUP BY v.category_id, v.kra_key, v.title_key,
             t.kpi_rows, t.employee_count, t.variant_count, t.weightage_values, t.uom_types,
             t.frequencies, t.frequency_cycle_starts, t.avg_score
  ),
  kra_level AS (
    SELECT category_id, kra_key, max(kra_name) AS kra_name,
           count(*)::int AS kpi_count,
           sum(employee_count)::int AS employee_rows,
           jsonb_agg(jsonb_build_object(
             'kpi_key', title_key,
             'title_key', title_key,
             'kpi_name', kpi_name,
             'kpi_title', kpi_title,
             'kpi_description', kpi_description,
             'kpi_rows', kpi_rows,
             'employee_count', employee_count,
             'variant_count', variant_count,
             'weightage_values', to_jsonb(weightage_values),
             'uom_types', to_jsonb(uom_types),
             'frequencies', to_jsonb(COALESCE(frequencies, ARRAY[]::text[])),
             'frequency_cycle_starts', to_jsonb(COALESCE(frequency_cycle_starts, ARRAY[]::text[])),
             'avg_score', round(avg_score, 2),
             'is_structured', is_structured,
             'is_org_level', is_org_level,
             'variants', variants
           ) ORDER BY kpi_title) AS kpis
    FROM kpi_level
    GROUP BY category_id, kra_key
  ),
  cat_level AS (
    SELECT c.id AS category_id,
           c.name AS category_name,
           count(*)::int AS kra_count,
           sum(kl.kpi_count)::int AS kpi_count,
           jsonb_agg(jsonb_build_object(
             'kra_key', kl.kra_key,
             'kra_name', kl.kra_name,
             'kpi_count', kl.kpi_count,
             'kpis', kl.kpis
           ) ORDER BY kl.kra_name) AS kras
    FROM kra_level kl
    JOIN public.kra_categories c ON c.id = kl.category_id
    GROUP BY c.id, c.name
  )
  SELECT jsonb_build_object(
    'authorized', true,
    'period', p_period,
    'year', p_year,
    -- ADR-281: scope-level people counts are DISTINCT employees, never row sums.
    'employee_total', (SELECT count(DISTINCT employee_id)::int FROM scoped),
    'categories', COALESCE(jsonb_agg(jsonb_build_object(
        'category_id', category_id,
        'category_name', category_name,
        'kra_count', kra_count,
        'kpi_count', kpi_count,
        'kras', kras
      ) ORDER BY category_name), '[]'::jsonb)
  )
  INTO v_result
  FROM cat_level;

  RETURN v_result;
END;
$function$;