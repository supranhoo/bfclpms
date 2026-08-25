-- ADR-317 — Exception KPIs: one entry per department, everyone in it is scored

ALTER TABLE public.org_kpi_dataset_defs
  ADD COLUMN IF NOT EXISTS entry_mode text NOT NULL DEFAULT 'row_entry',
  ADD COLUMN IF NOT EXISTS scope_dimension text,
  ADD COLUMN IF NOT EXISTS clean_value numeric,
  ADD COLUMN IF NOT EXISTS exception_direction text NOT NULL DEFAULT 'lower_better';

DO $$ BEGIN
  ALTER TABLE public.org_kpi_dataset_defs
    ADD CONSTRAINT okdd_entry_mode_chk CHECK (entry_mode IN ('row_entry','exception'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.org_kpi_dataset_defs
    ADD CONSTRAINT okdd_scope_dim_chk CHECK (scope_dimension IS NULL OR scope_dimension IN ('department','business_unit','location'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.org_kpi_dataset_defs
    ADD CONSTRAINT okdd_exception_dir_chk CHECK (exception_direction IN ('lower_better','higher_better'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Release runs: single-flight lock + audit + idempotency
CREATE TABLE IF NOT EXISTS public.org_kpi_dataset_release_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dataset_id uuid NOT NULL REFERENCES public.org_kpi_dataset_defs(id) ON DELETE CASCADE,
  review_period text NOT NULL,
  review_year integer NOT NULL,
  status text NOT NULL DEFAULT 'running',
  scope_dimension text,
  clean_value numeric,
  flagged_scopes integer NOT NULL DEFAULT 0,
  clean_scopes integer NOT NULL DEFAULT 0,
  employees_targeted integer NOT NULL DEFAULT 0,
  employees_updated integer NOT NULL DEFAULT 0,
  employees_skipped integer NOT NULL DEFAULT 0,
  skipped_details jsonb NOT NULL DEFAULT '[]'::jsonb,
  error_message text,
  lease_expires_at timestamptz NOT NULL DEFAULT now() + interval '10 minutes',
  performed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  CONSTRAINT okdrr_status_chk CHECK (status IN ('running','completed','failed'))
);

GRANT SELECT ON public.org_kpi_dataset_release_runs TO authenticated;
GRANT ALL ON public.org_kpi_dataset_release_runs TO service_role;
ALTER TABLE public.org_kpi_dataset_release_runs ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY okdrr_select ON public.org_kpi_dataset_release_runs
    FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS okdrr_dataset_period_idx
  ON public.org_kpi_dataset_release_runs (dataset_id, review_year, review_period, created_at DESC);

-- Seed one row per organisational scope for the period
CREATE OR REPLACE FUNCTION public.org_kpi_dataset_seed_scope_rows(
  p_dataset_id uuid,
  p_review_period text,
  p_review_year integer,
  p_mapped_only boolean DEFAULT true,
  p_dry_run boolean DEFAULT true
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_user uuid := auth.uid();
  v_def public.org_kpi_dataset_defs;
  v_created int := 0;
  v_existing int := 0;
  v_dept record;
  v_clean numeric;
  v_value_key text;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT public.can_write_kpi_dataset(v_user, p_dataset_id) THEN
    RAISE EXCEPTION 'Not authorised to enter data for this KPI';
  END IF;

  SELECT * INTO v_def FROM public.org_kpi_dataset_defs WHERE id = p_dataset_id;
  IF v_def.id IS NULL THEN RAISE EXCEPTION 'Data table not found'; END IF;
  IF COALESCE(v_def.scope_dimension,'department') <> 'department' THEN
    RAISE EXCEPTION 'Only department-scoped tables can be seeded for now';
  END IF;

  v_clean := COALESCE(v_def.clean_value, 0);
  v_value_key := COALESCE(v_def.value_column_key, 'value');

  FOR v_dept IN
    SELECT d.id, d.name
    FROM public.departments d
    WHERE (NOT p_mapped_only) OR EXISTS (
      SELECT 1 FROM public.kpis k
      JOIN public.profiles p ON p.id = k.employee_id
      WHERE k.is_org_level = true
        AND k.category_id = v_def.category_id
        AND public.normalize_kpi_text(k.kra_name) = public.normalize_kpi_text(v_def.kra_name)
        AND public.normalize_kpi_text(k.kpi_name) = public.normalize_kpi_text(v_def.kpi_name)
        AND k.review_period = p_review_period
        AND k.review_year = p_review_year
        AND p.department_id = d.id
        AND COALESCE(p.is_active, true)
    )
    ORDER BY d.name
  LOOP
    IF EXISTS (
      SELECT 1 FROM public.org_kpi_dataset_rows r
      WHERE r.dataset_id = p_dataset_id
        AND r.review_period = p_review_period
        AND r.review_year = p_review_year
        AND r.department_id = v_dept.id
    ) THEN
      v_existing := v_existing + 1;
      CONTINUE;
    END IF;

    v_created := v_created + 1;
    IF NOT p_dry_run THEN
      INSERT INTO public.org_kpi_dataset_rows (
        dataset_id, review_period, review_year, department_id, scope_label, values, entered_by, updated_by
      ) VALUES (
        p_dataset_id, p_review_period, p_review_year, v_dept.id, v_dept.name,
        jsonb_build_object(v_value_key, v_clean), v_user, v_user
      );
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'dry_run', p_dry_run, 'created', v_created, 'existing', v_existing,
    'clean_value', v_clean, 'value_column_key', v_value_key
  );
END;
$$;

-- Coverage / exception summary for the period
CREATE OR REPLACE FUNCTION public.org_kpi_dataset_exception_summary(
  p_dataset_id uuid, p_review_year integer, p_review_period text
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_user uuid := auth.uid();
  v_def public.org_kpi_dataset_defs;
  v_clean numeric;
  v_key text;
  v_flagged int := 0; v_cleanc int := 0; v_blank int := 0;
  v_flagged_emps int := 0;
  v_total_scopes int := 0;
  v_items jsonb := '[]'::jsonb;
  v_r record;
  v_val numeric;
  v_emps int;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO v_def FROM public.org_kpi_dataset_defs WHERE id = p_dataset_id;
  IF v_def.id IS NULL THEN RAISE EXCEPTION 'Data table not found'; END IF;

  v_clean := COALESCE(v_def.clean_value, 0);
  v_key := COALESCE(v_def.value_column_key, 'value');

  FOR v_r IN
    SELECT r.id, r.department_id, r.scope_label, r.values, d.name AS dept_name
    FROM public.org_kpi_dataset_rows r
    LEFT JOIN public.departments d ON d.id = r.department_id
    WHERE r.dataset_id = p_dataset_id
      AND r.review_year = p_review_year
      AND r.review_period = p_review_period
      AND public.can_read_kpi_dataset_row(v_user, r.*)
    ORDER BY COALESCE(d.name, r.scope_label)
  LOOP
    v_total_scopes := v_total_scopes + 1;
    v_val := NULLIF(v_r.values->>v_key, '')::numeric;

    IF v_val IS NULL THEN
      v_blank := v_blank + 1;
      CONTINUE;
    END IF;

    IF (v_def.exception_direction = 'lower_better' AND v_val > v_clean)
       OR (v_def.exception_direction = 'higher_better' AND v_val < v_clean) THEN
      v_flagged := v_flagged + 1;
      SELECT count(*) INTO v_emps
      FROM public.kpis k
      JOIN public.profiles p ON p.id = k.employee_id
      WHERE k.is_org_level = true
        AND k.category_id = v_def.category_id
        AND public.normalize_kpi_text(k.kra_name) = public.normalize_kpi_text(v_def.kra_name)
        AND public.normalize_kpi_text(k.kpi_name) = public.normalize_kpi_text(v_def.kpi_name)
        AND k.review_period = p_review_period
        AND k.review_year = p_review_year
        AND p.department_id = v_r.department_id
        AND COALESCE(p.is_active, true);
      v_flagged_emps := v_flagged_emps + COALESCE(v_emps, 0);
      v_items := v_items || jsonb_build_object(
        'row_id', v_r.id, 'department_id', v_r.department_id,
        'scope_name', COALESCE(v_r.dept_name, v_r.scope_label, 'Unscoped'),
        'value', v_val, 'employees', COALESCE(v_emps, 0)
      );
    ELSE
      v_cleanc := v_cleanc + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'entry_mode', v_def.entry_mode,
    'scope_dimension', COALESCE(v_def.scope_dimension, 'department'),
    'clean_value', v_clean,
    'direction', v_def.exception_direction,
    'total_scopes', v_total_scopes,
    'flagged_scopes', v_flagged,
    'clean_scopes', v_cleanc,
    'blank_scopes', v_blank,
    'employees_flagged', v_flagged_emps,
    'flagged', v_items
  );
END;
$$;

-- Preview / release the period across every scope
CREATE OR REPLACE FUNCTION public.org_kpi_dataset_release_scoped(
  p_dataset_id uuid,
  p_review_year integer,
  p_review_period text,
  p_dry_run boolean DEFAULT true,
  p_overwrite_policy text DEFAULT 'pre_review_only',
  p_max_employees integer DEFAULT 5000
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_user uuid := auth.uid();
  v_def public.org_kpi_dataset_defs;
  v_clean numeric;
  v_key text;
  v_run_id uuid;
  v_target record;
  v_value numeric;
  v_score numeric;
  v_ratings jsonb := '[]'::jsonb;
  v_preview jsonb := '[]'::jsonb;
  v_count int := 0;
  v_flagged int := 0;
  v_cleanc int := 0;
  v_res jsonb;
  v_capped boolean := false;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT public.can_write_kpi_dataset(v_user, p_dataset_id) THEN
    RAISE EXCEPTION 'Not authorised to release this KPI';
  END IF;

  SELECT * INTO v_def FROM public.org_kpi_dataset_defs WHERE id = p_dataset_id;
  IF v_def.id IS NULL THEN RAISE EXCEPTION 'Data table not found'; END IF;

  v_clean := COALESCE(v_def.clean_value, 0);
  v_key := COALESCE(v_def.value_column_key, 'value');

  IF NOT p_dry_run THEN
    -- single-flight: refuse while another release of the same period holds a live lease
    IF EXISTS (
      SELECT 1 FROM public.org_kpi_dataset_release_runs rr
      WHERE rr.dataset_id = p_dataset_id
        AND rr.review_year = p_review_year
        AND rr.review_period = p_review_period
        AND rr.status = 'running'
        AND rr.lease_expires_at > now()
    ) THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'release_in_progress');
    END IF;

    INSERT INTO public.org_kpi_dataset_release_runs (
      dataset_id, review_period, review_year, scope_dimension, clean_value, performed_by
    ) VALUES (
      p_dataset_id, p_review_period, p_review_year,
      COALESCE(v_def.scope_dimension,'department'), v_clean, v_user
    ) RETURNING id INTO v_run_id;
  END IF;

  FOR v_target IN
    SELECT k.id AS kpi_id, k.employee_id, p.full_name, p.employee_code,
           p.department_id, d.name AS department_name,
           NULLIF(r.values->>v_key, '')::numeric AS scope_value
    FROM public.kpis k
    JOIN public.profiles p ON p.id = k.employee_id
    LEFT JOIN public.departments d ON d.id = p.department_id
    LEFT JOIN LATERAL (
      SELECT rr.values FROM public.org_kpi_dataset_rows rr
      WHERE rr.dataset_id = p_dataset_id
        AND rr.review_year = p_review_year
        AND rr.review_period = p_review_period
        AND rr.department_id = p.department_id
      ORDER BY rr.updated_at DESC LIMIT 1
    ) r ON true
    WHERE k.is_org_level = true
      AND k.category_id = v_def.category_id
      AND public.normalize_kpi_text(k.kra_name) = public.normalize_kpi_text(v_def.kra_name)
      AND public.normalize_kpi_text(k.kpi_name) = public.normalize_kpi_text(v_def.kpi_name)
      AND k.review_period = p_review_period
      AND k.review_year = p_review_year
      AND COALESCE(p.is_active, true)
    ORDER BY d.name NULLS LAST, p.full_name
  LOOP
    IF v_count >= GREATEST(COALESCE(p_max_employees, 5000), 1) THEN
      v_capped := true;
      EXIT;
    END IF;
    v_count := v_count + 1;

    v_value := COALESCE(v_target.scope_value, v_clean);
    IF (v_def.exception_direction = 'lower_better' AND v_value > v_clean)
       OR (v_def.exception_direction = 'higher_better' AND v_value < v_clean) THEN
      v_flagged := v_flagged + 1;
    ELSE
      v_cleanc := v_cleanc + 1;
    END IF;

    v_score := public.compute_org_kpi_score_for_kpi(v_target.kpi_id, v_value);

    v_ratings := v_ratings || jsonb_build_object(
      'kpi_id', v_target.kpi_id,
      'achieved_value', v_value,
      'self_score', v_score
    );

    IF p_dry_run AND jsonb_array_length(v_preview) < 200 THEN
      v_preview := v_preview || jsonb_build_object(
        'employee_name', v_target.full_name,
        'employee_code', v_target.employee_code,
        'department_name', COALESCE(v_target.department_name, 'Unassigned'),
        'value', v_value,
        'score', v_score
      );
    END IF;
  END LOOP;

  IF p_dry_run THEN
    RETURN jsonb_build_object(
      'ok', true, 'dry_run', true,
      'employees_targeted', v_count,
      'employees_flagged', v_flagged,
      'employees_clean', v_cleanc,
      'capped', v_capped,
      'clean_value', v_clean,
      'sample', v_preview
    );
  END IF;

  BEGIN
    v_res := public.propagate_org_kpi_value(
      v_ratings, false,
      format('Exception KPI release — %s %s', p_review_period, p_review_year),
      COALESCE(p_overwrite_policy, 'pre_review_only')
    );
  EXCEPTION WHEN OTHERS THEN
    UPDATE public.org_kpi_dataset_release_runs
       SET status = 'failed', error_message = SQLERRM, finished_at = now()
     WHERE id = v_run_id;
    RAISE;
  END;

  UPDATE public.org_kpi_dataset_release_runs SET
    status = 'completed',
    flagged_scopes = v_flagged,
    clean_scopes = v_cleanc,
    employees_targeted = v_count,
    employees_updated = COALESCE((v_res->>'propagated')::int, (v_res->>'propagated_count')::int, 0),
    employees_skipped = COALESCE((v_res->>'skipped_count')::int, jsonb_array_length(COALESCE(v_res->'skipped', v_res->'skipped_details', '[]'::jsonb)), 0),
    skipped_details = COALESCE(v_res->'skipped', v_res->'skipped_details', '[]'::jsonb),
    finished_at = now()
  WHERE id = v_run_id;

  RETURN jsonb_build_object(
    'ok', true, 'dry_run', false, 'run_id', v_run_id,
    'employees_targeted', v_count,
    'employees_flagged', v_flagged,
    'employees_clean', v_cleanc,
    'capped', v_capped,
    'result', v_res
  );
END;
$$;

-- Last release run for a period
CREATE OR REPLACE FUNCTION public.org_kpi_dataset_release_state(
  p_dataset_id uuid, p_review_year integer, p_review_period text
) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT COALESCE(to_jsonb(rr), 'null'::jsonb)
  FROM public.org_kpi_dataset_release_runs rr
  WHERE rr.dataset_id = p_dataset_id
    AND rr.review_year = p_review_year
    AND rr.review_period = p_review_period
  ORDER BY rr.created_at DESC LIMIT 1;
$$;

REVOKE EXECUTE ON FUNCTION public.org_kpi_dataset_seed_scope_rows(uuid,text,integer,boolean,boolean) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.org_kpi_dataset_exception_summary(uuid,integer,text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.org_kpi_dataset_release_scoped(uuid,integer,text,boolean,text,integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.org_kpi_dataset_release_state(uuid,integer,text) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.org_kpi_dataset_seed_scope_rows(uuid,text,integer,boolean,boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.org_kpi_dataset_exception_summary(uuid,integer,text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.org_kpi_dataset_release_scoped(uuid,integer,text,boolean,text,integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.org_kpi_dataset_release_state(uuid,integer,text) TO authenticated, service_role;