CREATE OR REPLACE FUNCTION public.migrate_okv_on_scope_change(
  p_category_id   uuid,
  p_kra_name      text,
  p_kpi_name      text,
  p_review_period text,
  p_review_year   integer,
  p_old_scope     text,
  p_new_scope     text,
  p_triggered_by  uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_action            text;
  v_aggregate_value   numeric;
  v_inherit_status    text;
  v_new_okv_id        uuid;
  v_count_aggregated  integer := 0;
  v_count_split       integer := 0;
  v_dept_id           uuid;
  v_emp_id            uuid;
  -- FIX: declare as %ROWTYPE so v_src.id and to_jsonb(v_src) are always
  -- type-resolvable (NULL when unassigned). Bare `record` raises
  -- "record \"v_src\" is not assigned yet" in dept->employee path.
  v_src               public.org_kpi_values%ROWTYPE;
BEGIN
  IF p_old_scope = p_new_scope THEN
    RETURN jsonb_build_object('action', 'noop', 'aggregated', 0, 'split', 0);
  END IF;

  IF (p_old_scope = 'employee' AND p_new_scope IN ('department','organization'))
     OR (p_old_scope = 'department' AND p_new_scope = 'organization') THEN
    v_action := 'aggregate';
  ELSIF (p_old_scope = 'organization' AND p_new_scope IN ('department','employee'))
     OR (p_old_scope = 'department' AND p_new_scope = 'employee') THEN
    v_action := 'split';
  ELSE
    v_action := 'rekey';
  END IF;

  -- =====================================================
  -- AGGREGATION PATH (unchanged)
  -- =====================================================
  IF v_action = 'aggregate' THEN
    IF p_new_scope = 'organization' THEN
      SELECT AVG(achieved_value),
             CASE
               WHEN bool_or(status = 'approved')   THEN 'approved'
               WHEN bool_or(status = 'propagated') THEN 'propagated'
               ELSE 'draft'
             END
        INTO v_aggregate_value, v_inherit_status
      FROM public.org_kpi_values
      WHERE category_id   = p_category_id
        AND kra_name      = p_kra_name
        AND kpi_name      = p_kpi_name
        AND review_period = p_review_period
        AND review_year   = p_review_year;

      DELETE FROM public.org_kpi_values
      WHERE category_id   = p_category_id
        AND kra_name      = p_kra_name
        AND kpi_name      = p_kpi_name
        AND review_period = p_review_period
        AND review_year   = p_review_year;

      INSERT INTO public.org_kpi_values
        (category_id, kra_name, kpi_name, review_period, review_year,
         achieved_value, status, department_id, employee_id, entered_by)
      VALUES
        (p_category_id, p_kra_name, p_kpi_name, p_review_period, p_review_year,
         v_aggregate_value, COALESCE(v_inherit_status, 'draft'), NULL, NULL, p_triggered_by)
      RETURNING id INTO v_new_okv_id;

      v_count_aggregated := 1;

    ELSIF p_new_scope = 'department' THEN
      FOR v_dept_id IN
        SELECT DISTINCT p.department_id
        FROM public.kpis k
        JOIN public.profiles p ON p.id = k.employee_id
        WHERE k.category_id   = p_category_id
          AND k.kra_name      = p_kra_name
          AND k.kpi_name      = p_kpi_name
          AND k.review_period = p_review_period
          AND k.review_year   = p_review_year
          AND k.is_org_level  = true
          AND p.department_id IS NOT NULL
      LOOP
        SELECT AVG(o.achieved_value),
               CASE
                 WHEN bool_or(o.status = 'approved')   THEN 'approved'
                 WHEN bool_or(o.status = 'propagated') THEN 'propagated'
                 ELSE 'draft'
               END
          INTO v_aggregate_value, v_inherit_status
        FROM public.org_kpi_values o
        JOIN public.profiles p ON p.id = o.employee_id
        WHERE o.category_id   = p_category_id
          AND o.kra_name      = p_kra_name
          AND o.kpi_name      = p_kpi_name
          AND o.review_period = p_review_period
          AND o.review_year   = p_review_year
          AND p.department_id = v_dept_id;

        DELETE FROM public.org_kpi_values o
        USING public.profiles p
        WHERE o.employee_id   = p.id
          AND p.department_id = v_dept_id
          AND o.category_id   = p_category_id
          AND o.kra_name      = p_kra_name
          AND o.kpi_name      = p_kpi_name
          AND o.review_period = p_review_period
          AND o.review_year   = p_review_year;

        INSERT INTO public.org_kpi_values
          (category_id, kra_name, kpi_name, review_period, review_year,
           achieved_value, status, department_id, employee_id, entered_by)
        VALUES
          (p_category_id, p_kra_name, p_kpi_name, p_review_period, p_review_year,
           v_aggregate_value, COALESCE(v_inherit_status, 'draft'), v_dept_id, NULL, p_triggered_by)
        RETURNING id INTO v_new_okv_id;

        v_count_aggregated := v_count_aggregated + 1;
      END LOOP;
    END IF;

  -- =====================================================
  -- SPLIT PATH
  -- =====================================================
  ELSIF v_action = 'split' THEN
    IF p_old_scope = 'organization' THEN
      SELECT * INTO v_src
      FROM public.org_kpi_values
      WHERE category_id   = p_category_id
        AND kra_name      = p_kra_name
        AND kpi_name      = p_kpi_name
        AND review_period = p_review_period
        AND review_year   = p_review_year
        AND employee_id IS NULL
        AND department_id IS NULL
      LIMIT 1;
    END IF;
    -- For dept->employee, v_src remains all-NULL %ROWTYPE; fields safely resolve.

    IF p_new_scope = 'employee' THEN
      FOR v_emp_id IN
        SELECT DISTINCT employee_id
        FROM public.kpis
        WHERE category_id   = p_category_id
          AND kra_name      = p_kra_name
          AND kpi_name      = p_kpi_name
          AND review_period = p_review_period
          AND review_year   = p_review_year
          AND is_org_level  = true
          AND employee_id IS NOT NULL
      LOOP
        DECLARE
          v_seed_value numeric;
        BEGIN
          IF p_old_scope = 'organization' THEN
            v_seed_value := v_src.achieved_value;
          ELSE
            SELECT o.achieved_value INTO v_seed_value
            FROM public.org_kpi_values o
            JOIN public.profiles p ON p.id = v_emp_id
            WHERE o.category_id   = p_category_id
              AND o.kra_name      = p_kra_name
              AND o.kpi_name      = p_kpi_name
              AND o.review_period = p_review_period
              AND o.review_year   = p_review_year
              AND o.department_id = p.department_id
              AND o.employee_id IS NULL
            LIMIT 1;
          END IF;

          INSERT INTO public.org_kpi_values
            (category_id, kra_name, kpi_name, review_period, review_year,
             achieved_value, status, employee_id, entered_by)
          VALUES
            (p_category_id, p_kra_name, p_kpi_name, p_review_period, p_review_year,
             v_seed_value, 'draft', v_emp_id, p_triggered_by)
          ON CONFLICT DO NOTHING
          RETURNING id INTO v_new_okv_id;

          INSERT INTO public.okv_migration_history
            (category_id, kra_name, kpi_name, review_period, review_year,
             action, old_scope, new_scope, original_okv_id, new_okv_id,
             original_payload, triggered_by)
          VALUES
            (p_category_id, p_kra_name, p_kpi_name, p_review_period, p_review_year,
             'split', p_old_scope, p_new_scope,
             CASE WHEN p_old_scope = 'organization' THEN v_src.id ELSE NULL END,
             v_new_okv_id,
             CASE WHEN p_old_scope = 'organization' THEN to_jsonb(v_src) ELSE NULL END,
             p_triggered_by);

          v_count_split := v_count_split + 1;
        END;
      END LOOP;

      IF p_old_scope = 'organization' AND v_src.id IS NOT NULL THEN
        DELETE FROM public.org_kpi_values WHERE id = v_src.id;
      ELSIF p_old_scope = 'department' THEN
        DELETE FROM public.org_kpi_values
        WHERE category_id   = p_category_id
          AND kra_name      = p_kra_name
          AND kpi_name      = p_kpi_name
          AND review_period = p_review_period
          AND review_year   = p_review_year
          AND department_id IS NOT NULL
          AND employee_id IS NULL;
      END IF;

    ELSIF p_new_scope = 'department' THEN
      FOR v_dept_id IN
        SELECT DISTINCT p.department_id
        FROM public.kpis k
        JOIN public.profiles p ON p.id = k.employee_id
        WHERE k.category_id   = p_category_id
          AND k.kra_name      = p_kra_name
          AND k.kpi_name      = p_kpi_name
          AND k.review_period = p_review_period
          AND k.review_year   = p_review_year
          AND k.is_org_level  = true
          AND p.department_id IS NOT NULL
      LOOP
        INSERT INTO public.org_kpi_values
          (category_id, kra_name, kpi_name, review_period, review_year,
           achieved_value, status, department_id, employee_id, entered_by)
        VALUES
          (p_category_id, p_kra_name, p_kpi_name, p_review_period, p_review_year,
           v_src.achieved_value, 'draft', v_dept_id, NULL, p_triggered_by)
        ON CONFLICT DO NOTHING
        RETURNING id INTO v_new_okv_id;

        INSERT INTO public.okv_migration_history
          (category_id, kra_name, kpi_name, review_period, review_year,
           action, old_scope, new_scope, original_okv_id, new_okv_id,
           original_payload, triggered_by)
        VALUES
          (p_category_id, p_kra_name, p_kpi_name, p_review_period, p_review_year,
           'split', p_old_scope, p_new_scope, v_src.id, v_new_okv_id,
           to_jsonb(v_src), p_triggered_by);

        v_count_split := v_count_split + 1;
      END LOOP;

      IF v_src.id IS NOT NULL THEN
        DELETE FROM public.org_kpi_values WHERE id = v_src.id;
      END IF;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'action',     v_action,
    'aggregated', v_count_aggregated,
    'split',      v_count_split
  );
END;
$$;