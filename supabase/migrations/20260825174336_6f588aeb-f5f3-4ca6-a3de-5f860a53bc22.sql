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
  v_row public.org_kpi_dataset_rows;
  v_name text;
  v_val numeric;
  v_emps int;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO v_def FROM public.org_kpi_dataset_defs WHERE id = p_dataset_id;
  IF v_def.id IS NULL THEN RAISE EXCEPTION 'Data table not found'; END IF;

  v_clean := COALESCE(v_def.clean_value, 0);
  v_key := COALESCE(v_def.value_column_key, 'value');

  FOR v_row IN
    SELECT r.* FROM public.org_kpi_dataset_rows r
    WHERE r.dataset_id = p_dataset_id
      AND r.review_year = p_review_year
      AND r.review_period = p_review_period
      AND public.can_read_kpi_dataset_row(v_user, r)
  LOOP
    v_total_scopes := v_total_scopes + 1;
    SELECT d.name INTO v_name FROM public.departments d WHERE d.id = v_row.department_id;
    v_name := COALESCE(v_name, v_row.scope_label, 'Unscoped');

    BEGIN
      v_val := NULLIF(v_row.values->>v_key, '')::numeric;
    EXCEPTION WHEN OTHERS THEN
      v_val := NULL;
    END;

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
        AND p.department_id = v_row.department_id
        AND COALESCE(p.is_active, true);
      v_flagged_emps := v_flagged_emps + COALESCE(v_emps, 0);
      v_items := v_items || jsonb_build_object(
        'row_id', v_row.id, 'department_id', v_row.department_id,
        'scope_name', v_name, 'value', v_val, 'employees', COALESCE(v_emps, 0)
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

CREATE OR REPLACE FUNCTION public.org_kpi_dataset_set_exception_config(
  p_dataset_id uuid,
  p_entry_mode text,
  p_scope_dimension text,
  p_clean_value numeric,
  p_exception_direction text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_user uuid := auth.uid();
  v_def public.org_kpi_dataset_defs;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT (public.has_role(v_user, 'admin') OR public.bu_console_can_write(v_user)) THEN
    RAISE EXCEPTION 'Not authorised to change this data table';
  END IF;

  UPDATE public.org_kpi_dataset_defs SET
    entry_mode = COALESCE(p_entry_mode, entry_mode),
    scope_dimension = p_scope_dimension,
    clean_value = p_clean_value,
    exception_direction = COALESCE(p_exception_direction, exception_direction),
    updated_at = now()
  WHERE id = p_dataset_id
  RETURNING * INTO v_def;

  IF v_def.id IS NULL THEN RAISE EXCEPTION 'Data table not found'; END IF;
  RETURN to_jsonb(v_def);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.org_kpi_dataset_set_exception_config(uuid,text,text,numeric,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.org_kpi_dataset_set_exception_config(uuid,text,text,numeric,text) TO authenticated, service_role;