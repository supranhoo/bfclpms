-- ADR-263 — BU Console Phase 5: goal objects (bu_goals) + roll-up
CREATE TABLE IF NOT EXISTS public.bu_goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  definition_id uuid NOT NULL REFERENCES public.kpi_definitions_master(id) ON DELETE CASCADE,
  parent_goal_id uuid NULL REFERENCES public.bu_goals(id) ON DELETE SET NULL,
  entity_level public.kpi_goal_entity_level NOT NULL DEFAULT 'bu',
  business_unit_id uuid NULL REFERENCES public.business_units(id) ON DELETE SET NULL,
  department_id uuid NULL REFERENCES public.departments(id) ON DELETE SET NULL,
  owner_profile_id uuid NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  cycle_ref text NULL,
  review_period text NULL,
  review_year integer NOT NULL,
  progress_type public.kpi_goal_progress_type NOT NULL DEFAULT 'number',
  tracking_method public.kpi_goal_tracking_method NOT NULL DEFAULT 'manual',
  subperiod_summary_rule public.kpi_goal_summary_rule NOT NULL DEFAULT 'last',
  visibility public.kpi_goal_visibility NOT NULL DEFAULT 'public',
  unit text NULL,
  start_value numeric NULL,
  target_value numeric NULL,
  current_value numeric NULL,
  rollup_computed_at timestamptz NULL,
  rollup_source jsonb NULL,
  notes text NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.bu_goals TO authenticated;
GRANT ALL ON public.bu_goals TO service_role;

ALTER TABLE public.bu_goals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bu_goals_read_console_roles" ON public.bu_goals
  FOR SELECT TO authenticated
  USING (public.bu_console_can_read(auth.uid()));

CREATE POLICY "bu_goals_admin_write" ON public.bu_goals
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE UNIQUE INDEX IF NOT EXISTS bu_goals_scope_uniq
  ON public.bu_goals (
    definition_id,
    entity_level,
    COALESCE(business_unit_id, '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(department_id, '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(review_period, '*'),
    review_year
  );

CREATE INDEX IF NOT EXISTS bu_goals_definition_idx ON public.bu_goals (definition_id);
CREATE INDEX IF NOT EXISTS bu_goals_scope_idx ON public.bu_goals (review_year, business_unit_id, department_id);

DROP TRIGGER IF EXISTS bu_goals_set_updated_at ON public.bu_goals;
CREATE TRIGGER bu_goals_set_updated_at
  BEFORE UPDATE ON public.bu_goals
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ---------------------------------------------------------------
-- Roll-up: derive current_value from the mapped employee KPI rows.
-- Weighted (never a straight average) within a period, then summarised
-- across sub-periods by the goal's declared subperiod_summary_rule.
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.bu_goal_rollup(
  p_goal_id uuid,
  p_persist boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_goal public.bu_goals%ROWTYPE;
  v_def public.kpi_definitions_master%ROWTYPE;
  v_periods jsonb := '[]'::jsonb;
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

  SELECT * INTO v_def FROM public.kpi_definitions_master WHERE id = v_goal.definition_id;

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
      AND public.normalize_kpi_text(k.kra_name) = public.normalize_kpi_text(v_def.kra_name)
      AND public.normalize_kpi_text(k.kpi_name) = public.normalize_kpi_text(v_def.kpi_name)
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
    'authorized', true,
    'found', true,
    'goal_id', p_goal_id,
    'persisted', p_persist,
    'summary_rule', v_goal.subperiod_summary_rule::text,
    'tracking_method', v_goal.tracking_method::text,
    'current_value', v_value,
    'target_value', v_goal.target_value,
    'row_count', v_rows,
    'employee_count', v_emp,
    'periods', v_periods
  );
END;
$function$;

-- ---------------------------------------------------------------
-- Listing goals for the console (scoped, read-role gated).
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.bu_goal_list(
  p_year integer,
  p_period text DEFAULT NULL,
  p_bu_ids uuid[] DEFAULT NULL,
  p_dept_ids uuid[] DEFAULT NULL,
  p_page integer DEFAULT 1,
  p_page_size integer DEFAULT 200
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
    AND g.review_year = p_year
    AND (p_period IS NULL OR g.review_period IS NULL OR g.review_period = p_period)
    AND (p_bu_ids IS NULL OR array_length(p_bu_ids,1) IS NULL OR g.business_unit_id IS NULL OR g.business_unit_id = ANY(p_bu_ids))
    AND (p_dept_ids IS NULL OR array_length(p_dept_ids,1) IS NULL OR g.department_id IS NULL OR g.department_id = ANY(p_dept_ids));

  SELECT COALESCE(jsonb_agg(r ORDER BY r->>'kpi_name'), '[]'::jsonb) INTO v_rows
  FROM (
    SELECT jsonb_build_object(
             'id', g.id,
             'definition_id', g.definition_id,
             'parent_goal_id', g.parent_goal_id,
             'kra_name', m.kra_name,
             'kpi_name', m.kpi_name,
             'entity_level', g.entity_level::text,
             'business_unit_id', g.business_unit_id,
             'business_unit_name', bu.name,
             'department_id', g.department_id,
             'department_name', d.name,
             'owner_profile_id', g.owner_profile_id,
             'owner_name', p.full_name,
             'review_period', g.review_period,
             'review_year', g.review_year,
             'cycle_ref', g.cycle_ref,
             'progress_type', g.progress_type::text,
             'tracking_method', g.tracking_method::text,
             'subperiod_summary_rule', g.subperiod_summary_rule::text,
             'visibility', g.visibility::text,
             'unit', COALESCE(g.unit, m.uom),
             'start_value', g.start_value,
             'target_value', g.target_value,
             'current_value', g.current_value,
             'rollup_computed_at', g.rollup_computed_at
           ) AS r
    FROM public.bu_goals g
    JOIN public.kpi_definitions_master m ON m.id = g.definition_id
    LEFT JOIN public.business_units bu ON bu.id = g.business_unit_id
    LEFT JOIN public.departments d ON d.id = g.department_id
    LEFT JOIN public.profiles p ON p.id = g.owner_profile_id
    WHERE g.is_active = true
      AND g.review_year = p_year
      AND (p_period IS NULL OR g.review_period IS NULL OR g.review_period = p_period)
      AND (p_bu_ids IS NULL OR array_length(p_bu_ids,1) IS NULL OR g.business_unit_id IS NULL OR g.business_unit_id = ANY(p_bu_ids))
      AND (p_dept_ids IS NULL OR array_length(p_dept_ids,1) IS NULL OR g.department_id IS NULL OR g.department_id = ANY(p_dept_ids))
    ORDER BY m.kpi_name
    OFFSET v_offset LIMIT v_size
  ) s;

  RETURN jsonb_build_object('authorized', true, 'rows', v_rows, 'total', v_total, 'page', GREATEST(COALESCE(p_page,1),1), 'page_size', v_size);
END;
$function$;

-- ---------------------------------------------------------------
-- Admin-only upsert. Additive; never touches kpis/review_submissions.
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.bu_goal_upsert(
  p_definition_id uuid,
  p_review_year integer,
  p_id uuid DEFAULT NULL,
  p_entity_level public.kpi_goal_entity_level DEFAULT 'bu',
  p_business_unit_id uuid DEFAULT NULL,
  p_department_id uuid DEFAULT NULL,
  p_owner_profile_id uuid DEFAULT NULL,
  p_review_period text DEFAULT NULL,
  p_cycle_ref text DEFAULT NULL,
  p_progress_type public.kpi_goal_progress_type DEFAULT 'number',
  p_tracking_method public.kpi_goal_tracking_method DEFAULT 'manual',
  p_subperiod_summary_rule public.kpi_goal_summary_rule DEFAULT 'last',
  p_visibility public.kpi_goal_visibility DEFAULT 'public',
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
SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_id uuid;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT public.has_role(v_user, 'admin') THEN
    RETURN jsonb_build_object('authorized', false);
  END IF;
  IF p_parent_goal_id IS NOT NULL AND p_parent_goal_id = p_id THEN
    RETURN jsonb_build_object('authorized', true, 'error', 'A goal cannot be its own parent');
  END IF;

  IF p_id IS NOT NULL THEN
    UPDATE public.bu_goals
       SET definition_id = p_definition_id,
           entity_level = p_entity_level,
           business_unit_id = p_business_unit_id,
           department_id = p_department_id,
           owner_profile_id = p_owner_profile_id,
           review_period = p_review_period,
           review_year = p_review_year,
           cycle_ref = p_cycle_ref,
           progress_type = p_progress_type,
           tracking_method = p_tracking_method,
           subperiod_summary_rule = p_subperiod_summary_rule,
           visibility = p_visibility,
           unit = p_unit,
           start_value = p_start_value,
           target_value = p_target_value,
           current_value = CASE WHEN p_tracking_method = 'manual' THEN p_current_value ELSE current_value END,
           parent_goal_id = p_parent_goal_id,
           notes = p_notes
     WHERE id = p_id
     RETURNING id INTO v_id;
  ELSE
    INSERT INTO public.bu_goals (
      definition_id, entity_level, business_unit_id, department_id, owner_profile_id,
      review_period, review_year, cycle_ref, progress_type, tracking_method,
      subperiod_summary_rule, visibility, unit, start_value, target_value, current_value,
      parent_goal_id, notes, created_by
    ) VALUES (
      p_definition_id, p_entity_level, p_business_unit_id, p_department_id, p_owner_profile_id,
      p_review_period, p_review_year, p_cycle_ref, p_progress_type, p_tracking_method,
      p_subperiod_summary_rule, p_visibility, p_unit, p_start_value, p_target_value,
      CASE WHEN p_tracking_method = 'manual' THEN p_current_value ELSE NULL END,
      p_parent_goal_id, p_notes, v_user
    )
    ON CONFLICT (definition_id, entity_level,
                 COALESCE(business_unit_id, '00000000-0000-0000-0000-000000000000'::uuid),
                 COALESCE(department_id, '00000000-0000-0000-0000-000000000000'::uuid),
                 COALESCE(review_period, '*'), review_year)
    DO UPDATE SET
      owner_profile_id = EXCLUDED.owner_profile_id,
      cycle_ref = EXCLUDED.cycle_ref,
      progress_type = EXCLUDED.progress_type,
      tracking_method = EXCLUDED.tracking_method,
      subperiod_summary_rule = EXCLUDED.subperiod_summary_rule,
      visibility = EXCLUDED.visibility,
      unit = EXCLUDED.unit,
      start_value = EXCLUDED.start_value,
      target_value = EXCLUDED.target_value,
      current_value = CASE WHEN EXCLUDED.tracking_method = 'manual' THEN EXCLUDED.current_value ELSE public.bu_goals.current_value END,
      parent_goal_id = EXCLUDED.parent_goal_id,
      notes = EXCLUDED.notes,
      is_active = true
    RETURNING id INTO v_id;
  END IF;

  RETURN jsonb_build_object('authorized', true, 'id', v_id);
END;
$function$;

CREATE OR REPLACE FUNCTION public.bu_goal_archive(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := auth.uid();
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT public.has_role(v_user, 'admin') THEN
    RETURN jsonb_build_object('authorized', false);
  END IF;
  UPDATE public.bu_goals SET is_active = false WHERE id = p_id;
  RETURN jsonb_build_object('authorized', true, 'id', p_id);
END;
$function$;