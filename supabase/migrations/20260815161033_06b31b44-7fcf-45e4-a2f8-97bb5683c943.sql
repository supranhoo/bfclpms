CREATE OR REPLACE FUNCTION public.bu_goal_list(
  p_year integer,
  p_period text DEFAULT NULL,
  p_bu_ids uuid[] DEFAULT NULL,
  p_dept_ids uuid[] DEFAULT NULL,
  p_category_ids uuid[] DEFAULT NULL,
  p_page integer DEFAULT 1,
  p_page_size integer DEFAULT 200
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_user uuid := auth.uid();
  v_size integer := LEAST(GREATEST(COALESCE(p_page_size, 200), 1), 200);
  v_offset integer := (GREATEST(COALESCE(p_page, 1), 1) - 1) * v_size;
  v_total integer := 0;
  v_rows jsonb := '[]'::jsonb;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT public.bu_console_can_read(v_user) THEN
    RETURN jsonb_build_object('authorized', false, 'rows', '[]'::jsonb, 'total', 0);
  END IF;

  SELECT COUNT(*) INTO v_total
  FROM public.bu_goals g
  WHERE g.is_active = true
    AND g.parent_goal_id IS NULL
    AND g.review_year = p_year
    AND (p_period IS NULL OR g.review_period IS NULL OR g.review_period = p_period)
    AND (p_bu_ids IS NULL OR array_length(p_bu_ids,1) IS NULL OR g.business_unit_id IS NULL OR g.business_unit_id = ANY(p_bu_ids))
    AND (p_dept_ids IS NULL OR array_length(p_dept_ids,1) IS NULL OR g.department_id IS NULL OR g.department_id = ANY(p_dept_ids))
    AND (p_category_ids IS NULL OR array_length(p_category_ids,1) IS NULL OR g.category_id IS NULL OR g.category_id = ANY(p_category_ids));

  WITH roots AS (
    SELECT g.*
    FROM public.bu_goals g
    WHERE g.is_active = true
      AND g.parent_goal_id IS NULL
      AND g.review_year = p_year
      AND (p_period IS NULL OR g.review_period IS NULL OR g.review_period = p_period)
      AND (p_bu_ids IS NULL OR array_length(p_bu_ids,1) IS NULL OR g.business_unit_id IS NULL OR g.business_unit_id = ANY(p_bu_ids))
      AND (p_dept_ids IS NULL OR array_length(p_dept_ids,1) IS NULL OR g.department_id IS NULL OR g.department_id = ANY(p_dept_ids))
      AND (p_category_ids IS NULL OR array_length(p_category_ids,1) IS NULL OR g.category_id IS NULL OR g.category_id = ANY(p_category_ids))
    ORDER BY COALESCE(g.title, g.kra_name, ''), g.created_at
    OFFSET v_offset LIMIT v_size
  ), visible AS (
    SELECT r.*, 0 AS depth, COALESCE(r.title, r.kra_name, '') AS sort_root FROM roots r
    UNION ALL
    SELECT c.*, 1 AS depth, COALESCE(r.title, r.kra_name, '') AS sort_root
    FROM public.bu_goals c
    JOIN roots r ON c.parent_goal_id = r.id
    WHERE c.is_active = true
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', v.id,
           'title', v.title,
           'definition_id', v.definition_id,
           'parent_goal_id', v.parent_goal_id,
           'depth', v.depth,
           'category_id', v.category_id,
           'category_name', kc.name,
           'kra_name', COALESCE(v.kra_name, m.kra_name),
           'kpi_name', COALESCE(v.kpi_name_match, m.kpi_name),
           'goal_source', v.goal_source,
           'weight', v.weight,
           'entity_level', v.entity_level::text,
           'business_unit_id', v.business_unit_id,
           'business_unit_name', bu.name,
           'department_id', v.department_id,
           'department_name', d.name,
           'owner_profile_id', v.owner_profile_id,
           'owner_name', p.full_name,
           'review_period', v.review_period,
           'review_year', v.review_year,
           'cycle_ref', v.cycle_ref,
           'progress_type', v.progress_type::text,
           'tracking_method', v.tracking_method::text,
           'subperiod_summary_rule', v.subperiod_summary_rule::text,
           'visibility', v.visibility::text,
           'unit', COALESCE(v.unit, m.uom),
           'start_value', v.start_value,
           'target_value', v.target_value,
           'current_value', v.current_value,
           'notes', v.notes,
           'rollup_computed_at', v.rollup_computed_at
         ) ORDER BY v.sort_root, v.depth, COALESCE(v.title, '')), '[]'::jsonb)
    INTO v_rows
  FROM visible v
  LEFT JOIN public.kpi_definitions_master m ON m.id = v.definition_id
  LEFT JOIN public.kra_categories kc ON kc.id = v.category_id
  LEFT JOIN public.business_units bu ON bu.id = v.business_unit_id
  LEFT JOIN public.departments d ON d.id = v.department_id
  LEFT JOIN public.profiles p ON p.id = v.owner_profile_id;

  RETURN jsonb_build_object(
    'authorized', true, 'rows', v_rows, 'total', v_total,
    'page', GREATEST(COALESCE(p_page,1),1), 'page_size', v_size
  );
END;
$fn$;