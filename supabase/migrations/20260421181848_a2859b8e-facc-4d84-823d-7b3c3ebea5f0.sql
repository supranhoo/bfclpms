-- =====================================================================
-- v2.66.5 — Org KPI Scope Change Cascade + OKV Migration Helper
-- =====================================================================

-- 1. Migration history table
CREATE TABLE IF NOT EXISTS public.okv_migration_history (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id     uuid NOT NULL,
  kra_name        text NOT NULL,
  kpi_name        text NOT NULL,
  review_period   text NOT NULL,
  review_year     integer NOT NULL,
  action          text NOT NULL, -- 'aggregate' | 'split' | 'rekey'
  old_scope       text NOT NULL,
  new_scope       text NOT NULL,
  original_okv_id uuid,
  new_okv_id      uuid,
  original_payload jsonb,        -- snapshot of the source OKV row
  migrated_by     uuid,
  triggered_by    uuid,
  migrated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_okv_migration_history_lookup
  ON public.okv_migration_history (category_id, kra_name, kpi_name, review_period, review_year);

ALTER TABLE public.okv_migration_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins read okv migration history" ON public.okv_migration_history;
CREATE POLICY "Admins read okv migration history"
ON public.okv_migration_history
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins insert okv migration history" ON public.okv_migration_history;
CREATE POLICY "Admins insert okv migration history"
ON public.okv_migration_history
FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 2. OKV migration helper
-- Aggregates or splits org_kpi_values rows when scope changes.
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
  v_src               record;
BEGIN
  IF p_old_scope = p_new_scope THEN
    RETURN jsonb_build_object('action', 'noop', 'aggregated', 0, 'split', 0);
  END IF;

  -- Determine action: aggregating to a broader scope, or splitting to a narrower one.
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
  -- AGGREGATION PATH
  -- =====================================================
  IF v_action = 'aggregate' THEN
    IF p_new_scope = 'organization' THEN
      -- Collapse everything to a single org-wide row (employee_id IS NULL, department_id IS NULL)
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

      -- Archive originals
      INSERT INTO public.okv_migration_history
        (category_id, kra_name, kpi_name, review_period, review_year,
         action, old_scope, new_scope, original_okv_id, original_payload, triggered_by)
      SELECT category_id, kra_name, kpi_name, review_period, review_year,
             'aggregate', p_old_scope, p_new_scope, id, to_jsonb(o.*), p_triggered_by
      FROM public.org_kpi_values o
      WHERE category_id   = p_category_id
        AND kra_name      = p_kra_name
        AND kpi_name      = p_kpi_name
        AND review_period = p_review_period
        AND review_year   = p_review_year;

      GET DIAGNOSTICS v_count_aggregated = ROW_COUNT;

      DELETE FROM public.org_kpi_values
      WHERE category_id   = p_category_id
        AND kra_name      = p_kra_name
        AND kpi_name      = p_kpi_name
        AND review_period = p_review_period
        AND review_year   = p_review_year;

      IF v_count_aggregated > 0 THEN
        INSERT INTO public.org_kpi_values
          (category_id, kra_name, kpi_name, review_period, review_year,
           achieved_value, status, employee_id, department_id, entered_by)
        VALUES
          (p_category_id, p_kra_name, p_kpi_name, p_review_period, p_review_year,
           v_aggregate_value, COALESCE(v_inherit_status, 'draft'), NULL, NULL, p_triggered_by)
        RETURNING id INTO v_new_okv_id;

        UPDATE public.okv_migration_history
           SET new_okv_id = v_new_okv_id
         WHERE category_id = p_category_id
           AND kra_name = p_kra_name
           AND kpi_name = p_kpi_name
           AND review_period = p_review_period
           AND review_year = p_review_year
           AND new_okv_id IS NULL
           AND action = 'aggregate';
      END IF;

    ELSIF p_new_scope = 'department' THEN
      -- Collapse per-employee rows to one per department
      FOR v_dept_id IN
        SELECT DISTINCT p.department_id
        FROM public.org_kpi_values o
        JOIN public.profiles p ON p.id = o.employee_id
        WHERE o.category_id   = p_category_id
          AND o.kra_name      = p_kra_name
          AND o.kpi_name      = p_kpi_name
          AND o.review_period = p_review_period
          AND o.review_year   = p_review_year
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

        INSERT INTO public.okv_migration_history
          (category_id, kra_name, kpi_name, review_period, review_year,
           action, old_scope, new_scope, original_okv_id, original_payload, triggered_by)
        SELECT o.category_id, o.kra_name, o.kpi_name, o.review_period, o.review_year,
               'aggregate', p_old_scope, p_new_scope, o.id, to_jsonb(o.*), p_triggered_by
        FROM public.org_kpi_values o
        JOIN public.profiles p ON p.id = o.employee_id
        WHERE o.category_id   = p_category_id
          AND o.kra_name      = p_kra_name
          AND o.kpi_name      = p_kpi_name
          AND o.review_period = p_review_period
          AND o.review_year   = p_review_year
          AND p.department_id = v_dept_id;

        DELETE FROM public.org_kpi_values
        WHERE id IN (
          SELECT o.id FROM public.org_kpi_values o
          JOIN public.profiles p ON p.id = o.employee_id
          WHERE o.category_id   = p_category_id
            AND o.kra_name      = p_kra_name
            AND o.kpi_name      = p_kpi_name
            AND o.review_period = p_review_period
            AND o.review_year   = p_review_year
            AND p.department_id = v_dept_id
        );

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
      -- Capture the org-wide source row (employee_id IS NULL, department_id IS NULL)
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
    ELSE
      -- For dept→employee, we'll handle per-dept inside the loop below
      v_src := NULL;
    END IF;

    IF p_new_scope = 'employee' THEN
      -- One draft OKV per assigned employee (from kpis table)
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
            -- department → employee: seed from this employee's department OKV
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

      -- Remove old broader-scope rows
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
      -- organization → department: one OKV per department that has assigned employees
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

-- 3. Cascading scope change RPC
-- Applies a scope change to the base period, then optionally to all
-- unlocked open future periods (same fiscal year, > base month).
CREATE OR REPLACE FUNCTION public.change_org_kpi_scope_cascading(
  p_category_id    uuid,
  p_kra_name       text,
  p_kpi_name       text,
  p_base_period    text,
  p_base_year      integer,
  p_new_scope      text,
  p_cascade_forward boolean DEFAULT false,
  p_dry_run        boolean DEFAULT false,
  p_triggered_by   uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_period_order constant text[] := ARRAY[
    'July','August','September','October','November','December',
    'January','February','March','April','May','June'
  ];
  v_base_idx       integer;
  v_period         text;
  v_period_year    integer;
  v_period_idx     integer;
  v_old_scope      text;
  v_kpi_updates    integer;
  v_migration      jsonb;
  v_period_results jsonb := '[]'::jsonb;
  v_skipped        jsonb := '[]'::jsonb;
  v_is_locked      boolean;
  v_target_periods text[] := ARRAY[]::text[];
  v_target_years   integer[] := ARRAY[]::integer[];
  i                integer;
BEGIN
  v_base_idx := array_position(v_period_order, p_base_period);
  IF v_base_idx IS NULL THEN
    RAISE EXCEPTION 'Invalid base period: %', p_base_period;
  END IF;

  -- Always include base period
  v_target_periods := array_append(v_target_periods, p_base_period);
  v_target_years   := array_append(v_target_years,   p_base_year);

  -- Add forward periods (same fiscal year — July→June)
  IF p_cascade_forward THEN
    FOR i IN (v_base_idx + 1) .. array_length(v_period_order, 1) LOOP
      v_period := v_period_order[i];
      -- January-June belong to base_year + 1 if base is July-Dec; else same year
      IF v_base_idx <= 6 AND i >= 7 THEN
        v_period_year := p_base_year + 1;
      ELSE
        v_period_year := p_base_year;
      END IF;
      v_target_periods := array_append(v_target_periods, v_period);
      v_target_years   := array_append(v_target_years,   v_period_year);
    END LOOP;
  END IF;

  -- Process each target period
  FOR i IN 1 .. array_length(v_target_periods, 1) LOOP
    v_period      := v_target_periods[i];
    v_period_year := v_target_years[i];

    -- Lock check: any global lock for this period that disables KPI edit
    SELECT EXISTS(
      SELECT 1 FROM public.review_period_locks rpl
      JOIN public.review_periods rp ON rp.id = rpl.review_period_id
      WHERE rp.month_name = v_period
        AND rp.year       = v_period_year
        AND rpl.is_locked = true
        AND rpl.lock_type IN ('global','full')
    ) INTO v_is_locked;

    IF v_is_locked THEN
      v_skipped := v_skipped || jsonb_build_object(
        'period', v_period, 'year', v_period_year, 'reason', 'period_locked'
      );
      CONTINUE;
    END IF;

    -- Resolve current scope (may differ per period)
    SELECT DISTINCT org_level_scope INTO v_old_scope
    FROM public.kpis
    WHERE category_id   = p_category_id
      AND kra_name      = p_kra_name
      AND kpi_name      = p_kpi_name
      AND review_period = v_period
      AND review_year   = v_period_year
      AND is_org_level  = true
    LIMIT 1;

    IF v_old_scope IS NULL THEN
      v_skipped := v_skipped || jsonb_build_object(
        'period', v_period, 'year', v_period_year, 'reason', 'no_org_kpi_rows'
      );
      CONTINUE;
    END IF;

    IF p_dry_run THEN
      v_period_results := v_period_results || jsonb_build_object(
        'period', v_period, 'year', v_period_year,
        'old_scope', v_old_scope, 'new_scope', p_new_scope,
        'preview', true
      );
      CONTINUE;
    END IF;

    -- Apply scope change to kpis rows
    UPDATE public.kpis
       SET org_level_scope = p_new_scope
     WHERE category_id   = p_category_id
       AND kra_name      = p_kra_name
       AND kpi_name      = p_kpi_name
       AND review_period = v_period
       AND review_year   = v_period_year
       AND is_org_level  = true;
    GET DIAGNOSTICS v_kpi_updates = ROW_COUNT;

    -- Migrate OKV values for this period
    v_migration := public.migrate_okv_on_scope_change(
      p_category_id, p_kra_name, p_kpi_name,
      v_period, v_period_year,
      v_old_scope, p_new_scope, p_triggered_by
    );

    -- Audit
    INSERT INTO public.kpi_audit_logs (kpi_id, action, performed_by, metadata)
    SELECT k.id,
           'ORG_KPI_SCOPE_CASCADED',
           NULL,
           jsonb_build_object(
             'old_scope',     v_old_scope,
             'new_scope',     p_new_scope,
             'triggered_by',  p_triggered_by,
             'cascade_period', v_period,
             'cascade_year',   v_period_year,
             'okv_migration',  v_migration
           )
      FROM public.kpis k
     WHERE k.category_id   = p_category_id
       AND k.kra_name      = p_kra_name
       AND k.kpi_name      = p_kpi_name
       AND k.review_period = v_period
       AND k.review_year   = v_period_year
       AND k.is_org_level  = true
     LIMIT 1;

    v_period_results := v_period_results || jsonb_build_object(
      'period',        v_period,
      'year',          v_period_year,
      'old_scope',     v_old_scope,
      'new_scope',     p_new_scope,
      'kpis_updated',  v_kpi_updates,
      'okv_migration', v_migration
    );
  END LOOP;

  RETURN jsonb_build_object(
    'dry_run',  p_dry_run,
    'periods',  v_period_results,
    'skipped',  v_skipped
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.migrate_okv_on_scope_change(uuid, text, text, text, integer, text, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.change_org_kpi_scope_cascading(uuid, text, text, text, integer, text, boolean, boolean, uuid) TO authenticated;