-- ADR-276 Phase 1 — KRA Tree: alignment, status, dates, 4-level nesting.

ALTER TABLE public.bu_goals
  ADD COLUMN IF NOT EXISTS aligns_to_id uuid REFERENCES public.bu_goals(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS status text,
  ADD COLUMN IF NOT EXISTS status_reason text,
  ADD COLUMN IF NOT EXISTS status_set_by uuid,
  ADD COLUMN IF NOT EXISTS status_set_at timestamptz,
  ADD COLUMN IF NOT EXISTS start_date date,
  ADD COLUMN IF NOT EXISTS end_date date;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bu_goals_status_chk') THEN
    ALTER TABLE public.bu_goals
      ADD CONSTRAINT bu_goals_status_chk
      CHECK (status IS NULL OR status IN ('on_track','at_risk','behind','achieved','dropped'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS bu_goals_parent_idx ON public.bu_goals(parent_goal_id) WHERE is_active;
CREATE INDEX IF NOT EXISTS bu_goals_aligns_idx ON public.bu_goals(aligns_to_id) WHERE is_active;
CREATE INDEX IF NOT EXISTS bu_goals_year_idx ON public.bu_goals(review_year) WHERE is_active;

-- Progress % from start -> target. NULL when unknowable (never a fake zero).
CREATE OR REPLACE FUNCTION public.kra_progress_pct(p_start numeric, p_target numeric, p_current numeric)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_target IS NULL OR p_current IS NULL THEN NULL
    WHEN p_target = COALESCE(p_start, 0) THEN CASE WHEN p_current >= p_target THEN 100 ELSE 0 END
    ELSE GREATEST(0, LEAST(100, ROUND(((p_current - COALESCE(p_start, 0)) / (p_target - COALESCE(p_start, 0))) * 100, 2)))
  END;
$$;

-- Derived health: progress vs elapsed cycle time. Manual status always wins.
CREATE OR REPLACE FUNCTION public.kra_derive_status(
  p_pct numeric, p_start_date date, p_end_date date
) RETURNS text
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_expected numeric;
BEGIN
  IF p_pct IS NULL THEN RETURN 'not_set'; END IF;
  IF p_pct >= 100 THEN RETURN 'achieved'; END IF;

  IF p_start_date IS NULL OR p_end_date IS NULL OR p_end_date <= p_start_date THEN
    RETURN CASE WHEN p_pct > 0 THEN 'on_track' ELSE 'not_started' END;
  END IF;

  v_expected := GREATEST(0, LEAST(100,
    (EXTRACT(EPOCH FROM (now()::date - p_start_date)) / NULLIF(EXTRACT(EPOCH FROM (p_end_date - p_start_date)), 0)) * 100
  ));

  IF p_pct >= v_expected - 5 THEN RETURN 'on_track';
  ELSIF p_pct >= v_expected - 20 THEN RETURN 'at_risk';
  ELSE RETURN 'behind';
  END IF;
END;
$$;

-- One level of the tree at a time, server-paged. NULL parent = roots.
CREATE OR REPLACE FUNCTION public.kra_tree_list(
  p_year integer,
  p_period text DEFAULT NULL,
  p_parent_id uuid DEFAULT NULL,
  p_bu_ids uuid[] DEFAULT NULL,
  p_dept_ids uuid[] DEFAULT NULL,
  p_category_ids uuid[] DEFAULT NULL,
  p_search text DEFAULT NULL,
  p_page integer DEFAULT 1,
  p_page_size integer DEFAULT 100
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_size integer := LEAST(GREATEST(COALESCE(p_page_size, 100), 1), 200);
  v_offset integer := (GREATEST(COALESCE(p_page, 1), 1) - 1) * v_size;
  v_total integer := 0;
  v_rows jsonb := '[]'::jsonb;
  v_search text := NULLIF(btrim(COALESCE(p_search, '')), '');
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT public.bu_console_can_read(v_user) THEN
    RETURN jsonb_build_object('authorized', false, 'rows', '[]'::jsonb, 'total', 0);
  END IF;

  WITH scoped AS (
    SELECT g.*
    FROM public.bu_goals g
    WHERE g.is_active = true
      AND g.review_year = p_year
      AND (
        (p_parent_id IS NULL AND g.parent_goal_id IS NULL)
        OR (p_parent_id IS NOT NULL AND g.parent_goal_id = p_parent_id)
      )
      AND (p_period IS NULL OR g.review_period IS NULL OR g.review_period = p_period)
      AND (p_parent_id IS NOT NULL OR p_bu_ids IS NULL OR array_length(p_bu_ids,1) IS NULL
           OR g.business_unit_id IS NULL OR g.business_unit_id = ANY(p_bu_ids))
      AND (p_parent_id IS NOT NULL OR p_dept_ids IS NULL OR array_length(p_dept_ids,1) IS NULL
           OR g.department_id IS NULL OR g.department_id = ANY(p_dept_ids))
      AND (p_parent_id IS NOT NULL OR p_category_ids IS NULL OR array_length(p_category_ids,1) IS NULL
           OR g.category_id IS NULL OR g.category_id = ANY(p_category_ids))
      AND (v_search IS NULL OR COALESCE(g.title, g.kra_name, '') ILIKE '%' || v_search || '%')
  ), counted AS (
    SELECT COUNT(*)::int AS n FROM scoped
  ), page AS (
    SELECT s.* FROM scoped s
    ORDER BY COALESCE(s.title, s.kra_name, ''), s.created_at
    OFFSET v_offset LIMIT v_size
  )
  SELECT (SELECT n FROM counted),
         COALESCE(jsonb_agg(row_json ORDER BY sort_key), '[]'::jsonb)
    INTO v_total, v_rows
  FROM (
    SELECT COALESCE(g.title, g.kra_name, '') AS sort_key,
           jsonb_build_object(
             'id', g.id,
             'title', COALESCE(g.title, g.kra_name),
             'parent_goal_id', g.parent_goal_id,
             'aligns_to_id', g.aligns_to_id,
             'aligns_to_title', at2.title,
             'category_id', g.category_id,
             'category_name', kc.name,
             'kra_name', g.kra_name,
             'kpi_name', g.kpi_name_match,
             'goal_source', g.goal_source,
             'weight', g.weight,
             'entity_level', g.entity_level::text,
             'business_unit_id', g.business_unit_id,
             'business_unit_name', bu.name,
             'department_id', g.department_id,
             'department_name', d.name,
             'owner_profile_id', g.owner_profile_id,
             'owner_name', p.full_name,
             'review_period', g.review_period,
             'review_year', g.review_year,
             'start_date', g.start_date,
             'end_date', g.end_date,
             'unit', g.unit,
             'progress_type', g.progress_type::text,
             'subperiod_summary_rule', g.subperiod_summary_rule::text,
             'start_value', g.start_value,
             'target_value', g.target_value,
             'current_value', g.current_value,
             'progress_pct', public.kra_progress_pct(g.start_value, g.target_value, g.current_value),
             'status', COALESCE(g.status, public.kra_derive_status(
                          public.kra_progress_pct(g.start_value, g.target_value, g.current_value),
                          g.start_date, g.end_date)),
             'status_is_manual', g.status IS NOT NULL,
             'status_reason', g.status_reason,
             'notes', g.notes,
             'child_count', (SELECT COUNT(*) FROM public.bu_goals c WHERE c.parent_goal_id = g.id AND c.is_active),
             'aligned_count', (SELECT COUNT(*) FROM public.bu_goals a WHERE a.aligns_to_id = g.id AND a.is_active),
             'mapped_employee_count', CASE WHEN g.goal_source = 'kpi_rollup' THEN (
                 SELECT COUNT(DISTINCT k.employee_id)
                 FROM public.kpis k
                 JOIN public.profiles pr ON pr.id = k.employee_id AND pr.is_active = true
                 LEFT JOIN public.departments dd ON dd.id = pr.department_id
                 WHERE k.review_year = g.review_year
                   AND (g.review_period IS NULL OR k.review_period = g.review_period)
                   AND (g.category_id IS NULL OR k.category_id = g.category_id)
                   AND (g.kra_name IS NULL OR public.normalize_kpi_text(k.kra_name) = public.normalize_kpi_text(g.kra_name))
                   AND (g.kpi_name_match IS NULL OR public.normalize_kpi_text(k.kpi_name) = public.normalize_kpi_text(g.kpi_name_match))
                   AND (g.business_unit_id IS NULL OR dd.business_unit_id = g.business_unit_id)
                   AND (g.department_id IS NULL OR pr.department_id = g.department_id)
                   AND (g.entity_level <> 'individual' OR g.owner_profile_id IS NULL OR k.employee_id = g.owner_profile_id)
               ) ELSE 0 END,
             'last_updated_at', COALESCE(g.rollup_computed_at, g.updated_at)
           ) AS row_json
    FROM page g
    LEFT JOIN public.kra_categories kc ON kc.id = g.category_id
    LEFT JOIN public.business_units bu ON bu.id = g.business_unit_id
    LEFT JOIN public.departments d ON d.id = g.department_id
    LEFT JOIN public.profiles p ON p.id = g.owner_profile_id
    LEFT JOIN public.bu_goals at2 ON at2.id = g.aligns_to_id
  ) t;

  RETURN jsonb_build_object(
    'authorized', true,
    'rows', v_rows,
    'total', v_total,
    'page', GREATEST(COALESCE(p_page, 1), 1),
    'page_size', v_size,
    'parent_id', p_parent_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.kra_tree_list(integer, text, uuid, uuid[], uuid[], uuid[], text, integer, integer) FROM public;
GRANT EXECUTE ON FUNCTION public.kra_tree_list(integer, text, uuid, uuid[], uuid[], uuid[], text, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.kra_progress_pct(numeric, numeric, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.kra_derive_status(numeric, date, date) TO authenticated;

-- Upsert rebuilt: 4-level nesting, loop guard, alignment link and dates.
DROP FUNCTION IF EXISTS public.bu_goal_upsert(integer, uuid, text, uuid, text, text, text, numeric, uuid, kpi_goal_entity_level, uuid, uuid, uuid, text, text, kpi_goal_progress_type, kpi_goal_tracking_method, kpi_goal_summary_rule, kpi_goal_visibility, text, numeric, numeric, numeric, uuid, text);

CREATE OR REPLACE FUNCTION public.bu_goal_upsert(
  p_review_year integer,
  p_id uuid DEFAULT NULL,
  p_title text DEFAULT NULL,
  p_category_id uuid DEFAULT NULL,
  p_kra_name text DEFAULT NULL,
  p_kpi_name_match text DEFAULT NULL,
  p_goal_source text DEFAULT 'manual',
  p_weight numeric DEFAULT 1,
  p_definition_id uuid DEFAULT NULL,
  p_entity_level kpi_goal_entity_level DEFAULT 'bu',
  p_business_unit_id uuid DEFAULT NULL,
  p_department_id uuid DEFAULT NULL,
  p_owner_profile_id uuid DEFAULT NULL,
  p_review_period text DEFAULT NULL,
  p_cycle_ref text DEFAULT NULL,
  p_progress_type kpi_goal_progress_type DEFAULT 'number',
  p_tracking_method kpi_goal_tracking_method DEFAULT 'manual',
  p_subperiod_summary_rule kpi_goal_summary_rule DEFAULT 'last',
  p_visibility kpi_goal_visibility DEFAULT 'public',
  p_unit text DEFAULT NULL,
  p_start_value numeric DEFAULT NULL,
  p_target_value numeric DEFAULT NULL,
  p_current_value numeric DEFAULT NULL,
  p_parent_goal_id uuid DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_aligns_to_id uuid DEFAULT NULL,
  p_start_date date DEFAULT NULL,
  p_end_date date DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_id uuid;
  v_tracking kpi_goal_tracking_method;
  v_depth integer := 0;
  v_cursor uuid;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT public.has_role(v_user, 'admin') THEN
    RETURN jsonb_build_object('authorized', false);
  END IF;

  IF COALESCE(btrim(p_title), '') = '' THEN
    RETURN jsonb_build_object('authorized', true, 'error', 'This KRA needs a name');
  END IF;
  IF p_goal_source NOT IN ('kpi_rollup', 'child_rollup', 'manual') THEN
    RETURN jsonb_build_object('authorized', true, 'error', 'Unknown progress source');
  END IF;
  IF p_id IS NOT NULL AND p_parent_goal_id = p_id THEN
    RETURN jsonb_build_object('authorized', true, 'error', 'A KRA cannot sit under itself');
  END IF;
  IF p_id IS NOT NULL AND p_aligns_to_id = p_id THEN
    RETURN jsonb_build_object('authorized', true, 'error', 'A KRA cannot align to itself');
  END IF;
  IF p_start_date IS NOT NULL AND p_end_date IS NOT NULL AND p_end_date < p_start_date THEN
    RETURN jsonb_build_object('authorized', true, 'error', 'The end date cannot be before the start date');
  END IF;

  -- Depth + loop guard: walk up from the chosen parent (max 4 levels total).
  IF p_parent_goal_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.bu_goals WHERE id = p_parent_goal_id) THEN
      RETURN jsonb_build_object('authorized', true, 'error', 'Parent KRA not found');
    END IF;
    v_cursor := p_parent_goal_id;
    WHILE v_cursor IS NOT NULL AND v_depth < 10 LOOP
      IF p_id IS NOT NULL AND v_cursor = p_id THEN
        RETURN jsonb_build_object('authorized', true, 'error', 'That parent sits underneath this KRA — it would create a loop');
      END IF;
      v_depth := v_depth + 1;
      SELECT parent_goal_id INTO v_cursor FROM public.bu_goals WHERE id = v_cursor;
    END LOOP;
    IF v_depth >= 4 THEN
      RETURN jsonb_build_object('authorized', true, 'error', 'The tree goes four levels deep (Organisation, Business Unit, Department, Employee)');
    END IF;
  END IF;

  IF p_aligns_to_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.bu_goals WHERE id = p_aligns_to_id) THEN
    RETURN jsonb_build_object('authorized', true, 'error', 'The aligned KRA was not found');
  END IF;

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
           aligns_to_id = p_aligns_to_id,
           start_date = p_start_date,
           end_date = p_end_date,
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
      parent_goal_id, aligns_to_id, start_date, end_date, notes, created_by
    ) VALUES (
      btrim(p_title), p_category_id,
      NULLIF(btrim(COALESCE(p_kra_name, '')), ''),
      NULLIF(btrim(COALESCE(p_kpi_name_match, '')), ''),
      p_goal_source, GREATEST(COALESCE(p_weight, 1), 0),
      p_definition_id, p_entity_level, p_business_unit_id, p_department_id, p_owner_profile_id,
      p_review_period, p_review_year, p_cycle_ref, p_progress_type, v_tracking,
      p_subperiod_summary_rule, p_visibility, p_unit, p_start_value, p_target_value,
      CASE WHEN p_goal_source = 'manual' THEN p_current_value ELSE NULL END,
      p_parent_goal_id, p_aligns_to_id, p_start_date, p_end_date, p_notes, v_user
    )
    RETURNING id INTO v_id;
  END IF;

  RETURN jsonb_build_object('authorized', true, 'id', v_id);
END;
$$;

REVOKE ALL ON FUNCTION public.bu_goal_upsert(integer, uuid, text, uuid, text, text, text, numeric, uuid, kpi_goal_entity_level, uuid, uuid, uuid, text, text, kpi_goal_progress_type, kpi_goal_tracking_method, kpi_goal_summary_rule, kpi_goal_visibility, text, numeric, numeric, numeric, uuid, text, uuid, date, date) FROM public;
GRANT EXECUTE ON FUNCTION public.bu_goal_upsert(integer, uuid, text, uuid, text, text, text, numeric, uuid, kpi_goal_entity_level, uuid, uuid, uuid, text, text, kpi_goal_progress_type, kpi_goal_tracking_method, kpi_goal_summary_rule, kpi_goal_visibility, text, numeric, numeric, numeric, uuid, text, uuid, date, date) TO authenticated;