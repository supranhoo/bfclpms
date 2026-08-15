-- ADR-274 — BU Console: group KPI definition editing with per-employee overrides.

CREATE TABLE IF NOT EXISTS public.bu_console_edit_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  performed_by uuid REFERENCES auth.users(id),
  scope_kind text NOT NULL DEFAULT 'group',
  category_id uuid,
  kra_name text,
  kpi_name text,
  title_key text,
  variant_key text,
  review_period text,
  review_year integer,
  changes jsonb NOT NULL DEFAULT '{}'::jsonb,
  allow_locked boolean NOT NULL DEFAULT false,
  reset_overrides boolean NOT NULL DEFAULT false,
  affected_rows integer NOT NULL DEFAULT 0,
  skipped_rows integer NOT NULL DEFAULT 0,
  undone_at timestamptz,
  undone_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.bu_console_edit_runs TO authenticated;
GRANT ALL ON public.bu_console_edit_runs TO service_role;
ALTER TABLE public.bu_console_edit_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read console edit runs" ON public.bu_console_edit_runs
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TABLE IF NOT EXISTS public.bu_console_edit_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.bu_console_edit_runs(id) ON DELETE CASCADE,
  kpi_id uuid NOT NULL,
  employee_id uuid,
  old_values jsonb NOT NULL DEFAULT '{}'::jsonb,
  new_values jsonb NOT NULL DEFAULT '{}'::jsonb,
  reverted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bu_console_edit_items_run ON public.bu_console_edit_items(run_id);
CREATE INDEX IF NOT EXISTS idx_bu_console_edit_items_kpi ON public.bu_console_edit_items(kpi_id);

GRANT SELECT ON public.bu_console_edit_items TO authenticated;
GRANT ALL ON public.bu_console_edit_items TO service_role;
ALTER TABLE public.bu_console_edit_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read console edit items" ON public.bu_console_edit_items
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TABLE IF NOT EXISTS public.bu_console_kpi_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kpi_id uuid NOT NULL,
  field text NOT NULL,
  set_by uuid REFERENCES auth.users(id),
  run_id uuid REFERENCES public.bu_console_edit_runs(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (kpi_id, field)
);

CREATE INDEX IF NOT EXISTS idx_bu_console_kpi_overrides_kpi ON public.bu_console_kpi_overrides(kpi_id);

GRANT SELECT ON public.bu_console_kpi_overrides TO authenticated;
GRANT ALL ON public.bu_console_kpi_overrides TO service_role;
ALTER TABLE public.bu_console_kpi_overrides ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read console kpi overrides" ON public.bu_console_kpi_overrides
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_bu_console_edit_runs_updated_at
  BEFORE UPDATE ON public.bu_console_edit_runs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_bu_console_kpi_overrides_updated_at
  BEFORE UPDATE ON public.bu_console_kpi_overrides
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Whitelist of editable KPI definition columns. Anything outside this list is rejected.
CREATE OR REPLACE FUNCTION public.bu_console_editable_fields()
RETURNS text[]
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT ARRAY[
    'kpi_title','kpi_description','kpi_formula','kpi_scoring_logic',
    'weightage','target_value','uom','uom_type','frequency','threshold_mode',
    'qualitative_options','r5','r4','r3','r2','r1','r0',
    'kra_name','category_id'
  ]::text[]
$$;

-- Applies whitelisted jsonb changes to one kpis row, returning the old values actually changed.
CREATE OR REPLACE FUNCTION public.bu_console_apply_kpi_changes(p_kpi_id uuid, p_changes jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_field text;
  v_type text;
  v_old text;
  v_new text;
  v_old_vals jsonb := '{}'::jsonb;
  v_new_vals jsonb := '{}'::jsonb;
BEGIN
  FOR v_field IN SELECT jsonb_object_keys(p_changes)
  LOOP
    IF NOT (v_field = ANY (public.bu_console_editable_fields())) THEN
      RAISE EXCEPTION 'Field % is not editable from the BU Console', v_field;
    END IF;

    SELECT format_type(a.atttypid, a.atttypmod) INTO v_type
    FROM pg_attribute a
    WHERE a.attrelid = 'public.kpis'::regclass AND a.attname = v_field AND a.attnum > 0;

    EXECUTE format('SELECT (%I)::text FROM public.kpis WHERE id = $1', v_field)
      INTO v_old USING p_kpi_id;

    v_new := NULLIF(p_changes->>v_field, '');

    IF v_old IS NOT DISTINCT FROM v_new THEN
      CONTINUE;
    END IF;

    EXECUTE format('UPDATE public.kpis SET %I = $1::text::%s WHERE id = $2', v_field, v_type)
      USING v_new, p_kpi_id;

    v_old_vals := v_old_vals || jsonb_build_object(v_field, v_old);
    v_new_vals := v_new_vals || jsonb_build_object(v_field, v_new);
  END LOOP;

  RETURN jsonb_build_object('old', v_old_vals, 'new', v_new_vals);
END;
$$;

REVOKE ALL ON FUNCTION public.bu_console_apply_kpi_changes(uuid, jsonb) FROM PUBLIC;

-- Group edit: preview (dry run) or apply a definition change across every mapped employee row.
CREATE OR REPLACE FUNCTION public.bu_console_group_edit_definition(
  p_category_id uuid,
  p_kra_name text,
  p_kpi_name text,
  p_period text,
  p_year integer,
  p_changes jsonb,
  p_bu_ids uuid[] DEFAULT NULL,
  p_dept_ids uuid[] DEFAULT NULL,
  p_division_ids uuid[] DEFAULT NULL,
  p_manager_ids uuid[] DEFAULT NULL,
  p_title_key text DEFAULT NULL,
  p_variant_key text DEFAULT NULL,
  p_allow_locked boolean DEFAULT false,
  p_reset_overrides boolean DEFAULT false,
  p_dry_run boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_run uuid;
  v_rec record;
  v_field text;
  v_reason text;
  v_changes jsonb;
  v_applied jsonb;
  v_preview jsonb := '[]'::jsonb;
  v_skipped jsonb := '[]'::jsonb;
  v_weightage jsonb := '[]'::jsonb;
  v_detail_limit int := 500;
  v_write_n int := 0;
  v_skip_n int := 0;
  v_reasons text[] := ARRAY[]::text[];
  v_skip_summary jsonb;
  v_new_weight numeric;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- ADR-274: group definition edits are admin-only.
  IF NOT public.has_role(v_user, 'admin') THEN
    RETURN jsonb_build_object('authorized', false, 'preview', '[]'::jsonb, 'skipped_details', '[]'::jsonb);
  END IF;

  IF p_changes IS NULL OR p_changes = '{}'::jsonb THEN
    RETURN jsonb_build_object('authorized', true, 'dry_run', p_dry_run, 'will_write', 0, 'will_skip', 0,
                              'preview', '[]'::jsonb, 'skipped_details', '[]'::jsonb, 'skip_summary', '[]'::jsonb);
  END IF;

  FOR v_field IN SELECT jsonb_object_keys(p_changes)
  LOOP
    IF NOT (v_field = ANY (public.bu_console_editable_fields())) THEN
      RAISE EXCEPTION 'Field % is not editable from the BU Console', v_field;
    END IF;
  END LOOP;

  IF NOT p_dry_run THEN
    INSERT INTO public.bu_console_edit_runs (
      performed_by, scope_kind, category_id, kra_name, kpi_name, title_key, variant_key,
      review_period, review_year, changes, allow_locked, reset_overrides
    ) VALUES (
      v_user, 'group', p_category_id, p_kra_name, p_kpi_name, p_title_key, p_variant_key,
      p_period, p_year, p_changes, COALESCE(p_allow_locked,false), COALESCE(p_reset_overrides,false)
    ) RETURNING id INTO v_run;
  END IF;

  FOR v_rec IN
    SELECT k.id, k.employee_id, k.status, k.weightage, k.target_value,
           p.full_name, p.employee_code,
           d.name AS department_name, bu.name AS business_unit_name,
           rs.final_score,
           public.bu_console_variant_key(k.kpi_description, k.kpi_formula, k.kpi_scoring_logic, k.target_value) AS variant_key
    FROM public.kpis k
    JOIN public.profiles p ON p.id = k.employee_id AND p.is_active = true
    LEFT JOIN public.departments d ON d.id = p.department_id
    LEFT JOIN public.business_units bu ON bu.id = d.business_unit_id
    LEFT JOIN public.review_submissions rs ON rs.kpi_id = k.id
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
    ORDER BY p.full_name
  LOOP
    v_reason := NULL;

    -- POLICY §88 — an approved final score is immutable, no exception.
    IF v_rec.final_score IS NOT NULL THEN
      v_reason := 'final_score_locked';
    ELSIF v_rec.status::text <> 'kra_set' AND NOT COALESCE(p_allow_locked, false) THEN
      v_reason := 'past_kra_set';
    END IF;

    IF v_reason IS NOT NULL THEN
      v_skip_n := v_skip_n + 1;
      v_reasons := v_reasons || v_reason;
      IF v_skip_n <= v_detail_limit THEN
        v_skipped := v_skipped || jsonb_build_object(
          'kpi_id', v_rec.id, 'employee_id', v_rec.employee_id,
          'employee_name', v_rec.full_name, 'employee_code', v_rec.employee_code,
          'department_name', v_rec.department_name, 'business_unit_name', v_rec.business_unit_name,
          'current_status', v_rec.status::text, 'variant_key', v_rec.variant_key, 'reason', v_reason);
      END IF;
      CONTINUE;
    END IF;

    -- Individually overridden fields survive a group edit unless the admin resets them.
    v_changes := p_changes;
    IF NOT COALESCE(p_reset_overrides, false) THEN
      SELECT COALESCE(jsonb_object_agg(kv.key, kv.value), '{}'::jsonb) INTO v_changes
      FROM jsonb_each(p_changes) kv
      WHERE NOT EXISTS (
        SELECT 1 FROM public.bu_console_kpi_overrides o
        WHERE o.kpi_id = v_rec.id AND o.field = kv.key
      );
    END IF;

    IF v_changes = '{}'::jsonb THEN
      v_skip_n := v_skip_n + 1;
      v_reasons := v_reasons || 'individual_override';
      IF v_skip_n <= v_detail_limit THEN
        v_skipped := v_skipped || jsonb_build_object(
          'kpi_id', v_rec.id, 'employee_id', v_rec.employee_id,
          'employee_name', v_rec.full_name, 'employee_code', v_rec.employee_code,
          'department_name', v_rec.department_name, 'business_unit_name', v_rec.business_unit_name,
          'current_status', v_rec.status::text, 'variant_key', v_rec.variant_key,
          'reason', 'individual_override');
      END IF;
      CONTINUE;
    END IF;

    v_write_n := v_write_n + 1;

    IF p_dry_run THEN
      IF v_write_n <= v_detail_limit THEN
        v_preview := v_preview || jsonb_build_object(
          'kpi_id', v_rec.id, 'employee_id', v_rec.employee_id,
          'employee_name', v_rec.full_name, 'employee_code', v_rec.employee_code,
          'department_name', v_rec.department_name, 'business_unit_name', v_rec.business_unit_name,
          'current_status', v_rec.status::text, 'variant_key', v_rec.variant_key,
          'weightage', v_rec.weightage, 'target_value', v_rec.target_value,
          'fields', (SELECT COALESCE(jsonb_agg(key ORDER BY key), '[]'::jsonb) FROM jsonb_object_keys(v_changes) key));
      END IF;

      -- Weightage impact: what each affected employee's total becomes.
      IF v_changes ? 'weightage' THEN
        v_new_weight := NULLIF(v_changes->>'weightage','')::numeric;
        v_weightage := v_weightage || jsonb_build_object(
          'employee_id', v_rec.employee_id,
          'employee_name', v_rec.full_name,
          'employee_code', v_rec.employee_code,
          'current_total', (SELECT COALESCE(SUM(k2.weightage),0) FROM public.kpis k2
                             WHERE k2.employee_id = v_rec.employee_id
                               AND k2.review_period = p_period AND k2.review_year = p_year),
          'new_total', (SELECT COALESCE(SUM(CASE WHEN k2.id = v_rec.id THEN v_new_weight ELSE k2.weightage END),0)
                          FROM public.kpis k2
                         WHERE k2.employee_id = v_rec.employee_id
                           AND k2.review_period = p_period AND k2.review_year = p_year));
      END IF;
    ELSE
      v_applied := public.bu_console_apply_kpi_changes(v_rec.id, v_changes);

      IF (v_applied->'new') <> '{}'::jsonb THEN
        INSERT INTO public.bu_console_edit_items (run_id, kpi_id, employee_id, old_values, new_values)
        VALUES (v_run, v_rec.id, v_rec.employee_id, v_applied->'old', v_applied->'new');

        INSERT INTO public.kpi_audit_logs (kpi_id, action, performed_by, metadata)
        VALUES (v_rec.id, 'BU_CONSOLE_GROUP_EDIT', v_user,
                jsonb_build_object('run_id', v_run, 'old', v_applied->'old', 'new', v_applied->'new'));
      ELSE
        v_write_n := v_write_n - 1;
      END IF;
    END IF;
  END LOOP;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('reason', r.reason, 'count', r.n) ORDER BY r.n DESC), '[]'::jsonb)
    INTO v_skip_summary
  FROM (SELECT reason, count(*)::int AS n FROM unnest(v_reasons) AS reason GROUP BY reason) r;

  IF NOT p_dry_run THEN
    UPDATE public.bu_console_edit_runs
       SET affected_rows = v_write_n, skipped_rows = v_skip_n
     WHERE id = v_run;
  END IF;

  RETURN jsonb_build_object(
    'authorized', true,
    'dry_run', p_dry_run,
    'run_id', v_run,
    'will_write', v_write_n,
    'will_skip', v_skip_n,
    'updated', CASE WHEN p_dry_run THEN NULL ELSE v_write_n END,
    'detail_limit', v_detail_limit,
    'detail_truncated', (v_write_n > v_detail_limit OR v_skip_n > v_detail_limit),
    'skip_summary', v_skip_summary,
    'weightage_impact', v_weightage,
    'preview', v_preview,
    'skipped_details', v_skipped
  );
END;
$$;

REVOKE ALL ON FUNCTION public.bu_console_group_edit_definition(uuid, text, text, text, integer, jsonb, uuid[], uuid[], uuid[], uuid[], text, text, boolean, boolean, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bu_console_group_edit_definition(uuid, text, text, text, integer, jsonb, uuid[], uuid[], uuid[], uuid[], text, text, boolean, boolean, boolean) TO authenticated;

-- Single employee override.
CREATE OR REPLACE FUNCTION public.bu_console_row_override(
  p_kpi_id uuid,
  p_changes jsonb,
  p_allow_locked boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_run uuid;
  v_rec record;
  v_field text;
  v_applied jsonb;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT public.has_role(v_user, 'admin') THEN
    RETURN jsonb_build_object('authorized', false);
  END IF;

  FOR v_field IN SELECT jsonb_object_keys(COALESCE(p_changes, '{}'::jsonb))
  LOOP
    IF NOT (v_field = ANY (public.bu_console_editable_fields())) THEN
      RAISE EXCEPTION 'Field % is not editable from the BU Console', v_field;
    END IF;
  END LOOP;

  SELECT k.id, k.employee_id, k.status, k.review_period, k.review_year,
         k.category_id, k.kra_name, k.kpi_name, rs.final_score
    INTO v_rec
    FROM public.kpis k
    LEFT JOIN public.review_submissions rs ON rs.kpi_id = k.id
   WHERE k.id = p_kpi_id;

  IF v_rec.id IS NULL THEN
    RAISE EXCEPTION 'KPI not found';
  END IF;
  IF v_rec.final_score IS NOT NULL THEN
    RETURN jsonb_build_object('authorized', true, 'updated', 0, 'reason', 'final_score_locked');
  END IF;
  IF v_rec.status::text <> 'kra_set' AND NOT COALESCE(p_allow_locked, false) THEN
    RETURN jsonb_build_object('authorized', true, 'updated', 0, 'reason', 'past_kra_set');
  END IF;

  INSERT INTO public.bu_console_edit_runs (
    performed_by, scope_kind, category_id, kra_name, kpi_name,
    review_period, review_year, changes, allow_locked
  ) VALUES (
    v_user, 'row', v_rec.category_id, v_rec.kra_name, v_rec.kpi_name,
    v_rec.review_period, v_rec.review_year, p_changes, COALESCE(p_allow_locked,false)
  ) RETURNING id INTO v_run;

  v_applied := public.bu_console_apply_kpi_changes(p_kpi_id, p_changes);

  IF (v_applied->'new') = '{}'::jsonb THEN
    UPDATE public.bu_console_edit_runs SET affected_rows = 0 WHERE id = v_run;
    RETURN jsonb_build_object('authorized', true, 'updated', 0, 'run_id', v_run, 'reason', 'no_change');
  END IF;

  INSERT INTO public.bu_console_edit_items (run_id, kpi_id, employee_id, old_values, new_values)
  VALUES (v_run, p_kpi_id, v_rec.employee_id, v_applied->'old', v_applied->'new');

  INSERT INTO public.bu_console_kpi_overrides (kpi_id, field, set_by, run_id)
  SELECT p_kpi_id, key, v_user, v_run FROM jsonb_object_keys(v_applied->'new') AS key
  ON CONFLICT (kpi_id, field) DO UPDATE SET set_by = EXCLUDED.set_by, run_id = EXCLUDED.run_id, updated_at = now();

  INSERT INTO public.kpi_audit_logs (kpi_id, action, performed_by, metadata)
  VALUES (p_kpi_id, 'BU_CONSOLE_ROW_OVERRIDE', v_user,
          jsonb_build_object('run_id', v_run, 'old', v_applied->'old', 'new', v_applied->'new'));

  UPDATE public.bu_console_edit_runs SET affected_rows = 1 WHERE id = v_run;

  RETURN jsonb_build_object('authorized', true, 'updated', 1, 'run_id', v_run,
                            'old', v_applied->'old', 'new', v_applied->'new');
END;
$$;

REVOKE ALL ON FUNCTION public.bu_console_row_override(uuid, jsonb, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bu_console_row_override(uuid, jsonb, boolean) TO authenticated;

-- Undo: restore the previous value of every field this run changed, when untouched since.
CREATE OR REPLACE FUNCTION public.bu_console_undo_edit_run(p_run_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_run record;
  v_item record;
  v_field text;
  v_type text;
  v_current text;
  v_reverted int := 0;
  v_conflict int := 0;
  v_row_changed boolean;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF NOT public.has_role(v_user, 'admin') THEN
    RETURN jsonb_build_object('authorized', false);
  END IF;

  SELECT * INTO v_run FROM public.bu_console_edit_runs WHERE id = p_run_id;
  IF v_run.id IS NULL THEN
    RAISE EXCEPTION 'Edit run not found';
  END IF;
  IF v_run.undone_at IS NOT NULL THEN
    RETURN jsonb_build_object('authorized', true, 'reverted', 0, 'reason', 'already_undone');
  END IF;

  FOR v_item IN SELECT * FROM public.bu_console_edit_items WHERE run_id = p_run_id AND reverted_at IS NULL
  LOOP
    v_row_changed := false;

    FOR v_field IN SELECT jsonb_object_keys(v_item.new_values)
    LOOP
      SELECT format_type(a.atttypid, a.atttypmod) INTO v_type
      FROM pg_attribute a
      WHERE a.attrelid = 'public.kpis'::regclass AND a.attname = v_field AND a.attnum > 0;

      EXECUTE format('SELECT (%I)::text FROM public.kpis WHERE id = $1', v_field)
        INTO v_current USING v_item.kpi_id;

      -- Only revert when nobody edited the field after this run.
      IF v_current IS NOT DISTINCT FROM (v_item.new_values->>v_field) THEN
        EXECUTE format('UPDATE public.kpis SET %I = $1::text::%s WHERE id = $2', v_field, v_type)
          USING (v_item.old_values->>v_field), v_item.kpi_id;
        v_row_changed := true;
      ELSE
        v_conflict := v_conflict + 1;
      END IF;
    END LOOP;

    IF v_row_changed THEN
      v_reverted := v_reverted + 1;
      UPDATE public.bu_console_edit_items SET reverted_at = now() WHERE id = v_item.id;

      IF v_run.scope_kind = 'row' THEN
        DELETE FROM public.bu_console_kpi_overrides o
        WHERE o.kpi_id = v_item.kpi_id
          AND o.run_id = p_run_id;
      END IF;

      INSERT INTO public.kpi_audit_logs (kpi_id, action, performed_by, metadata)
      VALUES (v_item.kpi_id, 'BU_CONSOLE_EDIT_UNDO', v_user,
              jsonb_build_object('run_id', p_run_id, 'restored', v_item.old_values));
    END IF;
  END LOOP;

  UPDATE public.bu_console_edit_runs
     SET undone_at = now(), undone_by = v_user
   WHERE id = p_run_id;

  RETURN jsonb_build_object('authorized', true, 'reverted', v_reverted, 'conflicts', v_conflict);
END;
$$;

REVOKE ALL ON FUNCTION public.bu_console_undo_edit_run(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bu_console_undo_edit_run(uuid) TO authenticated;

-- Recent run history for the console panel.
CREATE OR REPLACE FUNCTION public.bu_console_edit_runs_list(p_limit integer DEFAULT 25)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
BEGIN
  IF v_user IS NULL OR NOT public.has_role(v_user, 'admin') THEN
    RETURN jsonb_build_object('authorized', false, 'runs', '[]'::jsonb);
  END IF;

  RETURN jsonb_build_object('authorized', true, 'runs', COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
             'id', r.id,
             'scope_kind', r.scope_kind,
             'kra_name', r.kra_name,
             'kpi_name', r.kpi_name,
             'review_period', r.review_period,
             'review_year', r.review_year,
             'fields', (SELECT COALESCE(jsonb_agg(key ORDER BY key), '[]'::jsonb) FROM jsonb_object_keys(r.changes) key),
             'affected_rows', r.affected_rows,
             'skipped_rows', r.skipped_rows,
             'performed_by_name', p.full_name,
             'undone_at', r.undone_at,
             'created_at', r.created_at
           ) ORDER BY r.created_at DESC)
    FROM (SELECT * FROM public.bu_console_edit_runs ORDER BY created_at DESC LIMIT GREATEST(COALESCE(p_limit,25),1)) r
    LEFT JOIN public.profiles p ON p.id = r.performed_by
  ), '[]'::jsonb));
END;
$$;

REVOKE ALL ON FUNCTION public.bu_console_edit_runs_list(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bu_console_edit_runs_list(integer) TO authenticated;