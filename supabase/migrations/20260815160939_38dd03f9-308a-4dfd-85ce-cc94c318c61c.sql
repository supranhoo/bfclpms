-- ADR-267 — BU Console goals become category/KRA anchored with parent→child roll-up.

ALTER TABLE public.bu_goals
  ADD COLUMN IF NOT EXISTS title text,
  ADD COLUMN IF NOT EXISTS category_id uuid REFERENCES public.kra_categories(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS kra_name text,
  ADD COLUMN IF NOT EXISTS kpi_name_match text,
  ADD COLUMN IF NOT EXISTS weight numeric NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS goal_source text NOT NULL DEFAULT 'kpi_rollup';

ALTER TABLE public.bu_goals ALTER COLUMN definition_id DROP NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bu_goals_goal_source_chk') THEN
    ALTER TABLE public.bu_goals
      ADD CONSTRAINT bu_goals_goal_source_chk
      CHECK (goal_source IN ('kpi_rollup', 'child_rollup', 'manual'));
  END IF;
END $$;

DROP INDEX IF EXISTS public.bu_goals_scope_uniq;
CREATE UNIQUE INDEX IF NOT EXISTS bu_goals_scope_uniq
  ON public.bu_goals (
    definition_id, entity_level,
    COALESCE(business_unit_id, '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(department_id, '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(review_period, '*'), review_year
  ) WHERE definition_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS bu_goals_parent_idx ON public.bu_goals (parent_goal_id);
CREATE INDEX IF NOT EXISTS bu_goals_category_idx ON public.bu_goals (category_id, review_year);

-- ---------------------------------------------------------------- list
DROP FUNCTION IF EXISTS public.bu_goal_list(integer, text, uuid[], uuid[], integer, integer);
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

  CREATE TEMP TABLE _scoped ON COMMIT DROP AS
  SELECT g.*
  FROM public.bu_goals g
  WHERE g.is_active = true
    AND g.review_year = p_year
    AND (p_period IS NULL OR g.review_period IS NULL OR g.review_period = p_period)
    AND (p_bu_ids IS NULL OR array_length(p_bu_ids,1) IS NULL OR g.business_unit_id IS NULL OR g.business_unit_id = ANY(p_bu_ids))
    AND (p_dept_ids IS NULL OR array_length(p_dept_ids,1) IS NULL OR g.department_id IS NULL OR g.department_id = ANY(p_dept_ids))
    AND (p_category_ids IS NULL OR array_length(p_category_ids,1) IS NULL OR g.category_id IS NULL OR g.category_id = ANY(p_category_ids));

  SELECT COUNT(*) INTO v_total FROM _scoped WHERE parent_goal_id IS NULL;

  WITH roots AS (
    SELECT s.* FROM _scoped s
    WHERE s.parent_goal_id IS NULL
    ORDER BY COALESCE(s.title, s.kra_name, '')
    OFFSET v_offset LIMIT v_size
  ), visible AS (
    SELECT r.*, 0 AS depth, COALESCE(r.title, r.kra_name, '') AS sort_root, r.id AS root_id FROM roots r
    UNION ALL
    SELECT c.*, 1 AS depth, COALESCE(r.title, r.kra_name, '') AS sort_root, r.id AS root_id
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

-- ---------------------------------------------------------------- upsert
DROP FUNCTION IF EXISTS public.bu_goal_upsert(uuid, integer, uuid, kpi_goal_entity_level, uuid, uuid, uuid, text, text, kpi_goal_progress_type, kpi_goal_tracking_method, kpi_goal_summary_rule, kpi_goal_visibility, text, numeric, numeric, numeric, uuid, text);
CREATE OR REPLACE FUNCTION public.bu_goal_upsert(
  p_review_year integer,
  p_id uuid DEFAULT NULL,
  p_title text DEFAULT NULL,
  p_category_id uuid DEFAULT NULL,
  p_kra_name text DEFAULT NULL,
  p_kpi_name_match text DEFAULT NULL,
  p_goal_source text DEFAULT 'kpi_rollup',
  p_weight numeric DEFAULT 1,
  p_definition_id uuid DEFAULT NULL,
  p_entity_level kpi_goal_entity_level DEFAULT 'bu',
  p_business_unit_id uuid DEFAULT NULL,
  p_department_id uuid DEFAULT NULL,
  p_owner_profile_id uuid DEFAULT NULL,
  p_review_period text DEFAULT NULL,
  p_cycle_ref text DEFAULT NULL,
  p_progress_type kpi_goal_progress_type DEFAULT 'number',
  p_tracking_method kpi_goal_tracking_method DEFAULT 'rollup',
  p_subperiod_summary_rule kpi_goal_summary_rule DEFAULT 'last',
  p_visibility kpi_goal_visibility DEFAULT 'public',
  p_unit text DEFAULT NULL,
  p_start_value numeric DEFAULT NULL,
  p_target_value numeric DEFAULT NULL,
  p_current_value numeric DEFAULT NULL,
  p_parent_goal_id uuid DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_user uuid := auth.uid();
  v_id uuid;
  v_parent_of_parent uuid;
  v_tracking kpi_goal_tracking_method := p_tracking_method;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT public.has_role(v_user, 'admin') THEN
    RETURN jsonb_build_object('authorized', false);
  END IF;

  IF COALESCE(btrim(p_title), '') = '' THEN
    RETURN jsonb_build_object('authorized', true, 'error', 'A goal needs a name');
  END IF;
  IF p_goal_source NOT IN ('kpi_rollup', 'child_rollup', 'manual') THEN
    RETURN jsonb_build_object('authorized', true, 'error', 'Unknown goal source');
  END IF;
  IF p_parent_goal_id IS NOT NULL AND p_id IS NOT NULL AND p_parent_goal_id = p_id THEN
    RETURN jsonb_build_object('authorized', true, 'error', 'A goal cannot be its own parent');
  END IF;

  IF p_parent_goal_id IS NOT NULL THEN
    SELECT parent_goal_id INTO v_parent_of_parent FROM public.bu_goals WHERE id = p_parent_goal_id;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('authorized', true, 'error', 'Parent goal not found');
    END IF;
    IF v_parent_of_parent IS NOT NULL THEN
      RETURN jsonb_build_object('authorized', true, 'error', 'Goals nest one level deep — pick a top-level goal as the parent');
    END IF;
    IF p_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.bu_goals WHERE parent_goal_id = p_id) THEN
      RETURN jsonb_build_object('authorized', true, 'error', 'This goal already has sub-goals, so it cannot become a sub-goal itself');
    END IF;
  END IF;

  -- Source drives tracking so the two can never disagree.
  v_tracking := CASE p_goal_source
                  WHEN 'manual' THEN 'manual'::kpi_goal_tracking_method
                  ELSE 'rollup'::kpi_goal_tracking_method
                END;

  IF p_id IS NOT NULL THEN
    UPDATE public.bu_goals
       SET title = btrim(p_title),
           category_id = p_category_id,
           kra_name = NULLIF(btrim(COALESCE(p_kra_name, '')), ''),
           kpi_name_match = NULLIF(btrim(COALESCE(p_kpi_name_match, '')), ''),
           goal_source = p_goal_source,
           weight = GREATEST(COALESCE(p_weight, 1), 0),
           definition_id = p_definition_id,
           entity_level = p_entity_level,
           business_unit_id = p_business_unit_id,
           department_id = p_department_id,
           owner_profile_id = p_owner_profile_id,
           review_period = p_review_period,
           review_year = p_review_year,
           cycle_ref = p_cycle_ref,
           progress_type = p_progress_type,
           tracking_method = v_tracking,
           subperiod_summary_rule = p_subperiod_summary_rule,
           visibility = p_visibility,
           unit = p_unit,
           start_value = p_start_value,
           target_value = p_target_value,
           current_value = CASE WHEN p_goal_source = 'manual' THEN p_current_value ELSE current_value END,
           parent_goal_id = p_parent_goal_id,
           notes = p_notes,
           updated_at = now()
     WHERE id = p_id
     RETURNING id INTO v_id;
  ELSE
    INSERT INTO public.bu_goals (
      title, category_id, kra_name, kpi_name_match, goal_source, weight,
      definition_id, entity_level, business_unit_id, department_id, owner_profile_id,
      review_period, review_year, cycle_ref, progress_type, tracking_method,
      subperiod_summary_rule, visibility, unit, start_value, target_value, current_value,
      parent_goal_id, notes, created_by
    ) VALUES (
      btrim(p_title), p_category_id,
      NULLIF(btrim(COALESCE(p_kra_name, '')), ''),
      NULLIF(btrim(COALESCE(p_kpi_name_match, '')), ''),
      p_goal_source, GREATEST(COALESCE(p_weight, 1), 0),
      p_definition_id, p_entity_level, p_business_unit_id, p_department_id, p_owner_profile_id,
      p_review_period, p_review_year, p_cycle_ref, p_progress_type, v_tracking,
      p_subperiod_summary_rule, p_visibility, p_unit, p_start_value, p_target_value,
      CASE WHEN p_goal_source = 'manual' THEN p_current_value ELSE NULL END,
      p_parent_goal_id, p_notes, v_user
    )
    RETURNING id INTO v_id;
  END IF;

  RETURN jsonb_build_object('authorized', true, 'id', v_id);
END;
$fn$;

-- ---------------------------------------------------------------- rollup
CREATE OR REPLACE FUNCTION public.bu_goal_rollup(p_goal_id uuid, p_persist boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_user uuid := auth.uid();
  v_goal public.bu_goals%ROWTYPE;
  v_def public.kpi_definitions_master%ROWTYPE;
  v_kra text;
  v_kpi text;
  v_periods jsonb := '[]'::jsonb;
  v_children jsonb := '[]'::jsonb;
  v_value numeric;
  v_rows integer := 0;
  v_emp integer := 0;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT public.bu_console_can_read(v_user) THEN
    RETURN jsonb_build_object('authorized', false);
  END IF;
  IF p_persist AND NOT public.has_role(v_user, 'admin') THEN
    RETURN jsonb_build_object('authorized', false);
  END IF;

  SELECT * INTO v_goal FROM public.bu_goals WHERE id = p_goal_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('authorized', true, 'found', false);
  END IF;

  IF v_goal.goal_source = 'manual' THEN
    RETURN jsonb_build_object(
      'authorized', true, 'found', true, 'goal_id', p_goal_id, 'goal_source', 'manual',
      'persisted', false, 'current_value', v_goal.current_value,
      'target_value', v_goal.target_value, 'periods', '[]'::jsonb, 'children', '[]'::jsonb
    );
  END IF;

  IF v_goal.goal_source = 'child_rollup' THEN
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
             'id', c.id, 'title', c.title, 'weight', c.weight,
             'current_value', c.current_value, 'target_value', c.target_value
           ) ORDER BY c.title), '[]'::jsonb)
      INTO v_children
    FROM public.bu_goals c
    WHERE c.parent_goal_id = p_goal_id AND c.is_active = true;

    SELECT CASE v_goal.subperiod_summary_rule
             WHEN 'sum' THEN SUM(c.current_value)
             WHEN 'last' THEN (
               SELECT l.current_value FROM public.bu_goals l
               WHERE l.parent_goal_id = p_goal_id AND l.is_active = true AND l.current_value IS NOT NULL
               ORDER BY COALESCE(l.rollup_computed_at, l.updated_at) DESC LIMIT 1
             )
             ELSE SUM(c.current_value * COALESCE(NULLIF(c.weight, 0), 1))
                  / NULLIF(SUM(CASE WHEN c.current_value IS NULL THEN 0 ELSE COALESCE(NULLIF(c.weight, 0), 1) END), 0)
           END
      INTO v_value
    FROM public.bu_goals c
    WHERE c.parent_goal_id = p_goal_id AND c.is_active = true AND c.current_value IS NOT NULL;

    v_value := ROUND(v_value, 2);

    IF p_persist THEN
      UPDATE public.bu_goals
         SET current_value = v_value,
             rollup_computed_at = now(),
             rollup_source = jsonb_build_object('children', v_children, 'rule', v_goal.subperiod_summary_rule::text)
       WHERE id = p_goal_id;
    END IF;

    RETURN jsonb_build_object(
      'authorized', true, 'found', true, 'goal_id', p_goal_id, 'goal_source', 'child_rollup',
      'persisted', p_persist, 'summary_rule', v_goal.subperiod_summary_rule::text,
      'current_value', v_value, 'target_value', v_goal.target_value,
      'children', v_children, 'periods', '[]'::jsonb,
      'row_count', jsonb_array_length(v_children), 'employee_count', 0
    );
  END IF;

  -- kpi_rollup: prefer the goal's own category/KRA/KPI anchors, fall back to
  -- the master definition it points at (legacy goals).
  IF v_goal.definition_id IS NOT NULL THEN
    SELECT * INTO v_def FROM public.kpi_definitions_master WHERE id = v_goal.definition_id;
  END IF;
  v_kra := COALESCE(v_goal.kra_name, v_def.kra_name);
  v_kpi := COALESCE(v_goal.kpi_name_match, v_def.kpi_name);

  IF v_goal.category_id IS NULL AND v_kra IS NULL AND v_kpi IS NULL THEN
    RETURN jsonb_build_object(
      'authorized', true, 'found', true, 'goal_id', p_goal_id, 'goal_source', 'kpi_rollup',
      'persisted', false, 'current_value', NULL, 'target_value', v_goal.target_value,
      'periods', '[]'::jsonb, 'children', '[]'::jsonb, 'row_count', 0, 'employee_count', 0,
      'error', 'This goal has no category, KRA or KPI to match live review data'
    );
  END IF;

  WITH src AS (
    SELECT k.review_period,
           k.weightage,
           COALESCE(
             rs.management_achieved_value, rs.hr_pms_achieved_value, rs.skip_level_achieved_value,
             rs.auditor_achieved_value, rs.functional_manager_achieved_value,
             rs.manager_achieved_value, rs.self_achieved_value, rs.achieved_value
           ) AS achieved,
           k.employee_id
    FROM public.kpis k
    JOIN public.profiles p ON p.id = k.employee_id AND p.is_active = true
    LEFT JOIN public.departments d ON d.id = p.department_id
    LEFT JOIN public.review_submissions rs ON rs.kpi_id = k.id
    WHERE k.review_year = v_goal.review_year
      AND (v_goal.review_period IS NULL OR k.review_period = v_goal.review_period)
      AND (v_goal.category_id IS NULL OR k.category_id = v_goal.category_id)
      AND (v_kra IS NULL OR public.normalize_kpi_text(k.kra_name) = public.normalize_kpi_text(v_kra))
      AND (v_kpi IS NULL OR public.normalize_kpi_text(k.kpi_name) = public.normalize_kpi_text(v_kpi))
      AND (v_goal.business_unit_id IS NULL OR d.business_unit_id = v_goal.business_unit_id)
      AND (v_goal.department_id IS NULL OR p.department_id = v_goal.department_id)
      AND COALESCE(rs.is_na, false) = false
  ), per_period AS (
    SELECT review_period,
           SUM(achieved * COALESCE(NULLIF(weightage, 0), 1)) / NULLIF(SUM(COALESCE(NULLIF(weightage, 0), 1)), 0) AS weighted_value,
           COUNT(*) AS row_count,
           COUNT(DISTINCT employee_id) AS emp_count,
           MIN(public.get_period_sort_order(review_period)) AS sort_order
    FROM src
    WHERE achieved IS NOT NULL
    GROUP BY review_period
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'review_period', review_period,
           'weighted_value', ROUND(weighted_value, 2),
           'row_count', row_count,
           'employee_count', emp_count
         ) ORDER BY sort_order), '[]'::jsonb),
         COALESCE(SUM(row_count), 0),
         COALESCE(MAX(emp_count), 0)
    INTO v_periods, v_rows, v_emp
  FROM per_period;

  IF jsonb_array_length(v_periods) = 0 THEN
    v_value := NULL;
  ELSE
    SELECT CASE v_goal.subperiod_summary_rule
             WHEN 'sum' THEN SUM((e->>'weighted_value')::numeric)
             WHEN 'avg' THEN AVG((e->>'weighted_value')::numeric)
             ELSE (v_periods -> (jsonb_array_length(v_periods) - 1) ->> 'weighted_value')::numeric
           END
      INTO v_value
    FROM jsonb_array_elements(v_periods) e;
  END IF;

  v_value := ROUND(v_value, 2);

  IF p_persist THEN
    UPDATE public.bu_goals
       SET current_value = v_value,
           rollup_computed_at = now(),
           rollup_source = jsonb_build_object('periods', v_periods, 'rule', v_goal.subperiod_summary_rule::text)
     WHERE id = p_goal_id;
  END IF;

  RETURN jsonb_build_object(
    'authorized', true, 'found', true, 'goal_id', p_goal_id, 'goal_source', 'kpi_rollup',
    'persisted', p_persist, 'summary_rule', v_goal.subperiod_summary_rule::text,
    'tracking_method', v_goal.tracking_method::text,
    'current_value', v_value, 'target_value', v_goal.target_value,
    'row_count', v_rows, 'employee_count', v_emp,
    'periods', v_periods, 'children', '[]'::jsonb
  );
END;
$fn$;

-- ------------------------------------------------- KRA / KPI name lookup
CREATE OR REPLACE FUNCTION public.bu_goal_kra_options(
  p_year integer,
  p_category_id uuid DEFAULT NULL,
  p_kra_name text DEFAULT NULL,
  p_search text DEFAULT NULL,
  p_limit integer DEFAULT 200
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_user uuid := auth.uid();
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 200), 1), 500);
  v_search text := NULLIF(btrim(COALESCE(p_search, '')), '');
  v_kras jsonb := '[]'::jsonb;
  v_kpis jsonb := '[]'::jsonb;
  v_kra_total integer := 0;
  v_kpi_total integer := 0;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT public.bu_console_can_read(v_user) THEN
    RETURN jsonb_build_object('authorized', false, 'kras', '[]'::jsonb, 'kpis', '[]'::jsonb);
  END IF;

  SELECT COUNT(*) INTO v_kra_total FROM (
    SELECT DISTINCT k.kra_name FROM public.kpis k
    WHERE k.review_year = p_year
      AND (p_category_id IS NULL OR k.category_id = p_category_id)
      AND (v_search IS NULL OR k.kra_name ILIKE '%' || v_search || '%')
  ) q;

  SELECT COALESCE(jsonb_agg(t.kra_name ORDER BY t.kra_name), '[]'::jsonb) INTO v_kras
  FROM (
    SELECT DISTINCT k.kra_name FROM public.kpis k
    WHERE k.review_year = p_year
      AND (p_category_id IS NULL OR k.category_id = p_category_id)
      AND (v_search IS NULL OR k.kra_name ILIKE '%' || v_search || '%')
    ORDER BY k.kra_name
    LIMIT v_limit
  ) t;

  IF p_kra_name IS NOT NULL THEN
    SELECT COUNT(*) INTO v_kpi_total FROM (
      SELECT DISTINCT k.kpi_name FROM public.kpis k
      WHERE k.review_year = p_year
        AND (p_category_id IS NULL OR k.category_id = p_category_id)
        AND public.normalize_kpi_text(k.kra_name) = public.normalize_kpi_text(p_kra_name)
    ) q;

    SELECT COALESCE(jsonb_agg(t.kpi_name ORDER BY t.kpi_name), '[]'::jsonb) INTO v_kpis
    FROM (
      SELECT DISTINCT k.kpi_name FROM public.kpis k
      WHERE k.review_year = p_year
        AND (p_category_id IS NULL OR k.category_id = p_category_id)
        AND public.normalize_kpi_text(k.kra_name) = public.normalize_kpi_text(p_kra_name)
      ORDER BY k.kpi_name
      LIMIT v_limit
    ) t;
  END IF;

  RETURN jsonb_build_object(
    'authorized', true,
    'kras', v_kras, 'kra_total', v_kra_total,
    'kpis', v_kpis, 'kpi_total', v_kpi_total,
    'limit', v_limit
  );
END;
$fn$;

REVOKE ALL ON FUNCTION public.bu_goal_list(integer, text, uuid[], uuid[], uuid[], integer, integer) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.bu_goal_list(integer, text, uuid[], uuid[], uuid[], integer, integer) TO authenticated;
REVOKE ALL ON FUNCTION public.bu_goal_kra_options(integer, uuid, text, text, integer) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.bu_goal_kra_options(integer, uuid, text, text, integer) TO authenticated;
REVOKE ALL ON FUNCTION public.bu_goal_upsert(integer, uuid, text, uuid, text, text, text, numeric, uuid, kpi_goal_entity_level, uuid, uuid, uuid, text, text, kpi_goal_progress_type, kpi_goal_tracking_method, kpi_goal_summary_rule, kpi_goal_visibility, text, numeric, numeric, numeric, uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.bu_goal_upsert(integer, uuid, text, uuid, text, text, text, numeric, uuid, kpi_goal_entity_level, uuid, uuid, uuid, text, text, kpi_goal_progress_type, kpi_goal_tracking_method, kpi_goal_summary_rule, kpi_goal_visibility, text, numeric, numeric, numeric, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bu_goal_rollup(uuid, boolean) TO authenticated;