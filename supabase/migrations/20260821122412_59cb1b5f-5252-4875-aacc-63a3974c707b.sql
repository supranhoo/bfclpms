
-- ADR-309 — KPI Data Ledger RPCs

CREATE OR REPLACE FUNCTION public.org_kpi_dataset_get(
  p_category_id uuid, p_kra_name text, p_kpi_name text
) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT CASE WHEN d.id IS NULL THEN NULL ELSE jsonb_build_object(
    'def', to_jsonb(d),
    'columns', COALESCE((
      SELECT jsonb_agg(to_jsonb(c) ORDER BY c.sort_order, c.label)
      FROM public.org_kpi_dataset_columns c WHERE c.dataset_id = d.id
    ), '[]'::jsonb)
  ) END
  FROM public.org_kpi_dataset_defs d
  WHERE d.category_id = p_category_id
    AND public.normalize_kpi_text(d.kra_name) = public.normalize_kpi_text(p_kra_name)
    AND public.normalize_kpi_text(d.kpi_name) = public.normalize_kpi_text(p_kpi_name)
    AND d.is_active
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.org_kpi_dataset_upsert_def(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_user uuid := auth.uid();
  v_id uuid;
  v_cat uuid := (p_payload->>'category_id')::uuid;
  v_kra text := p_payload->>'kra_name';
  v_kpi text := p_payload->>'kpi_name';
  v_col jsonb;
  v_keys text[] := ARRAY[]::text[];
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT (public.has_role(v_user,'admin'::app_role) OR public.bu_console_can_write(v_user)) THEN
    RAISE EXCEPTION 'Not authorised to configure this data table';
  END IF;
  IF v_cat IS NULL OR coalesce(v_kra,'') = '' OR coalesce(v_kpi,'') = '' THEN
    RAISE EXCEPTION 'category_id, kra_name and kpi_name are required';
  END IF;

  SELECT d.id INTO v_id FROM public.org_kpi_dataset_defs d
  WHERE d.category_id = v_cat
    AND public.normalize_kpi_text(d.kra_name) = public.normalize_kpi_text(v_kra)
    AND public.normalize_kpi_text(d.kpi_name) = public.normalize_kpi_text(v_kpi)
    AND d.is_active
  LIMIT 1;

  IF v_id IS NULL THEN
    INSERT INTO public.org_kpi_dataset_defs (
      category_id, kra_name, kpi_name, title, description, granularity, rollup_rule,
      value_column_key, target_column_key, weight_column_key, allow_provider_override, created_by
    ) VALUES (
      v_cat, v_kra, v_kpi,
      COALESCE(p_payload->>'title','Data table'),
      p_payload->>'description',
      COALESCE(p_payload->>'granularity','monthly'),
      COALESCE(p_payload->>'rollup_rule','sum_ratio'),
      p_payload->>'value_column_key', p_payload->>'target_column_key', p_payload->>'weight_column_key',
      COALESCE((p_payload->>'allow_provider_override')::boolean, true),
      v_user
    ) RETURNING id INTO v_id;
  ELSE
    UPDATE public.org_kpi_dataset_defs SET
      title = COALESCE(p_payload->>'title', title),
      description = COALESCE(p_payload->>'description', description),
      granularity = COALESCE(p_payload->>'granularity', granularity),
      rollup_rule = COALESCE(p_payload->>'rollup_rule', rollup_rule),
      value_column_key = COALESCE(p_payload->>'value_column_key', value_column_key),
      target_column_key = COALESCE(p_payload->>'target_column_key', target_column_key),
      weight_column_key = p_payload->>'weight_column_key',
      allow_provider_override = COALESCE((p_payload->>'allow_provider_override')::boolean, allow_provider_override)
    WHERE id = v_id;
  END IF;

  IF p_payload ? 'columns' THEN
    FOR v_col IN SELECT * FROM jsonb_array_elements(p_payload->'columns') LOOP
      v_keys := v_keys || (v_col->>'column_key');
      INSERT INTO public.org_kpi_dataset_columns (
        dataset_id, column_key, label, data_type, unit, is_required, is_key,
        editable_by, formula, display_format, options, sort_order
      ) VALUES (
        v_id, v_col->>'column_key', v_col->>'label',
        COALESCE(v_col->>'data_type','number'), v_col->>'unit',
        COALESCE((v_col->>'is_required')::boolean,false),
        COALESCE((v_col->>'is_key')::boolean,false),
        COALESCE(v_col->>'editable_by','provider'),
        v_col->>'formula', v_col->>'display_format',
        COALESCE(v_col->'options','[]'::jsonb),
        COALESCE((v_col->>'sort_order')::int,0)
      )
      ON CONFLICT (dataset_id, column_key) DO UPDATE SET
        label = EXCLUDED.label, data_type = EXCLUDED.data_type, unit = EXCLUDED.unit,
        is_required = EXCLUDED.is_required, is_key = EXCLUDED.is_key,
        editable_by = EXCLUDED.editable_by, formula = EXCLUDED.formula,
        display_format = EXCLUDED.display_format, options = EXCLUDED.options,
        sort_order = EXCLUDED.sort_order;
    END LOOP;
    DELETE FROM public.org_kpi_dataset_columns c
    WHERE c.dataset_id = v_id AND NOT (c.column_key = ANY(v_keys));
  END IF;

  RETURN public.org_kpi_dataset_get(v_cat, v_kra, v_kpi);
END;
$$;

CREATE OR REPLACE FUNCTION public.org_kpi_dataset_rows_read(
  p_dataset_id uuid,
  p_review_year integer DEFAULT NULL,
  p_review_period text DEFAULT NULL,
  p_limit integer DEFAULT 100,
  p_offset integer DEFAULT 0
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_user uuid := auth.uid();
  v_limit int := LEAST(GREATEST(COALESCE(p_limit,100),1), 500);
  v_total int;
  v_rows jsonb;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  CREATE TEMP TABLE IF NOT EXISTS _okd_visible (id uuid) ON COMMIT DROP;
  DELETE FROM _okd_visible;
  INSERT INTO _okd_visible
  SELECT r.id FROM public.org_kpi_dataset_rows r
  WHERE r.dataset_id = p_dataset_id
    AND (p_review_year IS NULL OR r.review_year = p_review_year)
    AND (p_review_period IS NULL OR r.review_period = p_review_period)
    AND public.can_read_kpi_dataset_row(v_user, r.*);

  SELECT count(*) INTO v_total FROM _okd_visible;

  SELECT COALESCE(jsonb_agg(x ORDER BY x->>'review_year', x->>'period_start', x->>'review_period', x->>'scope_label'), '[]'::jsonb)
  INTO v_rows
  FROM (
    SELECT to_jsonb(r) AS x FROM public.org_kpi_dataset_rows r
    JOIN _okd_visible v ON v.id = r.id
    ORDER BY r.review_year, r.period_start NULLS LAST, r.review_period, r.scope_label NULLS FIRST
    LIMIT v_limit OFFSET GREATEST(COALESCE(p_offset,0),0)
  ) s;

  RETURN jsonb_build_object('rows', v_rows, 'total', v_total, 'limit', v_limit, 'offset', GREATEST(COALESCE(p_offset,0),0));
END;
$$;

CREATE OR REPLACE FUNCTION public.org_kpi_dataset_row_save(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_user uuid := auth.uid();
  v_dataset uuid := (p_payload->>'dataset_id')::uuid;
  v_id uuid := NULLIF(p_payload->>'id','')::uuid;
  v_old public.org_kpi_dataset_rows;
  v_new public.org_kpi_dataset_rows;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT public.can_write_kpi_dataset(v_user, v_dataset) THEN
    RAISE EXCEPTION 'Not authorised to enter data for this KPI';
  END IF;

  IF v_id IS NOT NULL THEN
    SELECT * INTO v_old FROM public.org_kpi_dataset_rows WHERE id = v_id AND dataset_id = v_dataset;
    IF v_old.id IS NULL THEN RAISE EXCEPTION 'Row not found'; END IF;
    UPDATE public.org_kpi_dataset_rows SET
      review_period = COALESCE(p_payload->>'review_period', review_period),
      review_year = COALESCE((p_payload->>'review_year')::int, review_year),
      period_start = COALESCE(NULLIF(p_payload->>'period_start','')::date, period_start),
      division_id = NULLIF(p_payload->>'division_id','')::uuid,
      business_unit_id = NULLIF(p_payload->>'business_unit_id','')::uuid,
      department_id = NULLIF(p_payload->>'department_id','')::uuid,
      location_id = NULLIF(p_payload->>'location_id','')::uuid,
      pms_grade_id = NULLIF(p_payload->>'pms_grade_id','')::uuid,
      level_id = NULLIF(p_payload->>'level_id','')::uuid,
      employee_id = NULLIF(p_payload->>'employee_id','')::uuid,
      scope_label = p_payload->>'scope_label',
      impact_scope = COALESCE(p_payload->'impact_scope', impact_scope),
      values = COALESCE(p_payload->'values', values),
      revision = revision + 1,
      updated_by = v_user
    WHERE id = v_id RETURNING * INTO v_new;

    INSERT INTO public.org_kpi_dataset_row_history (row_id, dataset_id, revision, action, old_values, new_values, reason, performed_by)
    VALUES (v_id, v_dataset, v_new.revision, 'update', v_old.values, v_new.values, p_payload->>'reason', v_user);
  ELSE
    INSERT INTO public.org_kpi_dataset_rows (
      dataset_id, review_period, review_year, period_start,
      division_id, business_unit_id, department_id, location_id, pms_grade_id, level_id, employee_id,
      scope_label, impact_scope, values, entered_by, updated_by
    ) VALUES (
      v_dataset, p_payload->>'review_period', (p_payload->>'review_year')::int,
      NULLIF(p_payload->>'period_start','')::date,
      NULLIF(p_payload->>'division_id','')::uuid,
      NULLIF(p_payload->>'business_unit_id','')::uuid,
      NULLIF(p_payload->>'department_id','')::uuid,
      NULLIF(p_payload->>'location_id','')::uuid,
      NULLIF(p_payload->>'pms_grade_id','')::uuid,
      NULLIF(p_payload->>'level_id','')::uuid,
      NULLIF(p_payload->>'employee_id','')::uuid,
      p_payload->>'scope_label',
      COALESCE(p_payload->'impact_scope','{}'::jsonb),
      COALESCE(p_payload->'values','{}'::jsonb),
      v_user, v_user
    ) RETURNING * INTO v_new;

    INSERT INTO public.org_kpi_dataset_row_history (row_id, dataset_id, revision, action, old_values, new_values, reason, performed_by)
    VALUES (v_new.id, v_dataset, 1, 'create', NULL, v_new.values, p_payload->>'reason', v_user);
  END IF;

  RETURN to_jsonb(v_new);
END;
$$;

CREATE OR REPLACE FUNCTION public.org_kpi_dataset_row_delete(p_row_id uuid, p_reason text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_user uuid := auth.uid(); v_row public.org_kpi_dataset_rows;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO v_row FROM public.org_kpi_dataset_rows WHERE id = p_row_id;
  IF v_row.id IS NULL THEN RAISE EXCEPTION 'Row not found'; END IF;
  IF NOT public.can_write_kpi_dataset(v_user, v_row.dataset_id) THEN
    RAISE EXCEPTION 'Not authorised to remove this row';
  END IF;
  INSERT INTO public.org_kpi_dataset_row_history (row_id, dataset_id, revision, action, old_values, new_values, reason, performed_by)
  VALUES (v_row.id, v_row.dataset_id, v_row.revision + 1, 'delete', v_row.values, NULL, p_reason, v_user);
  DELETE FROM public.org_kpi_dataset_rows WHERE id = p_row_id;
  RETURN jsonb_build_object('deleted', true, 'id', p_row_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.org_kpi_dataset_bulk_import(
  p_dataset_id uuid, p_rows jsonb, p_dry_run boolean DEFAULT true
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_user uuid := auth.uid();
  v_row jsonb;
  v_existing uuid;
  v_created int := 0; v_updated int := 0; v_errors jsonb := '[]'::jsonb;
  v_idx int := 0;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT public.can_write_kpi_dataset(v_user, p_dataset_id) THEN
    RAISE EXCEPTION 'Not authorised to import data for this KPI';
  END IF;

  FOR v_row IN SELECT * FROM jsonb_array_elements(COALESCE(p_rows,'[]'::jsonb)) LOOP
    v_idx := v_idx + 1;
    IF coalesce(v_row->>'review_period','') = '' OR (v_row->>'review_year') IS NULL THEN
      v_errors := v_errors || jsonb_build_object('index', v_idx, 'error', 'Missing period or year');
      CONTINUE;
    END IF;

    SELECT r.id INTO v_existing FROM public.org_kpi_dataset_rows r
    WHERE r.dataset_id = p_dataset_id
      AND r.review_period = v_row->>'review_period'
      AND r.review_year = (v_row->>'review_year')::int
      AND r.department_id IS NOT DISTINCT FROM NULLIF(v_row->>'department_id','')::uuid
      AND r.business_unit_id IS NOT DISTINCT FROM NULLIF(v_row->>'business_unit_id','')::uuid
      AND r.division_id IS NOT DISTINCT FROM NULLIF(v_row->>'division_id','')::uuid
      AND r.employee_id IS NOT DISTINCT FROM NULLIF(v_row->>'employee_id','')::uuid
    LIMIT 1;

    IF v_existing IS NULL THEN v_created := v_created + 1; ELSE v_updated := v_updated + 1; END IF;

    IF NOT p_dry_run THEN
      PERFORM public.org_kpi_dataset_row_save(
        v_row || jsonb_build_object('dataset_id', p_dataset_id, 'id', v_existing, 'reason', COALESCE(v_row->>'reason','Bulk import'))
      );
    END IF;
  END LOOP;

  RETURN jsonb_build_object('dry_run', p_dry_run, 'created', v_created, 'updated', v_updated, 'errors', v_errors);
END;
$$;

CREATE OR REPLACE FUNCTION public.org_kpi_dataset_rollup(
  p_dataset_id uuid, p_review_year integer, p_review_period text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_def public.org_kpi_dataset_defs;
  v_value numeric; v_target numeric; v_weight numeric; v_count int; v_result numeric;
BEGIN
  SELECT * INTO v_def FROM public.org_kpi_dataset_defs WHERE id = p_dataset_id;
  IF v_def.id IS NULL THEN RAISE EXCEPTION 'Data table not found'; END IF;

  SELECT
    sum(NULLIF(r.values->>v_def.value_column_key,'')::numeric),
    sum(NULLIF(r.values->>COALESCE(v_def.target_column_key,'__none__'),'')::numeric),
    sum(NULLIF(r.values->>COALESCE(v_def.weight_column_key,'__none__'),'')::numeric),
    count(*)
  INTO v_value, v_target, v_weight, v_count
  FROM public.org_kpi_dataset_rows r
  WHERE r.dataset_id = p_dataset_id
    AND r.review_year = p_review_year
    AND (p_review_period IS NULL OR r.review_period = p_review_period);

  IF v_count = 0 THEN
    RETURN jsonb_build_object('value', NULL, 'row_count', 0, 'rule', v_def.rollup_rule, 'working', 'No rows captured for this period');
  END IF;

  v_result := CASE v_def.rollup_rule
    WHEN 'sum' THEN v_value
    WHEN 'avg' THEN v_value / NULLIF(v_count,0)
    WHEN 'sum_ratio' THEN CASE WHEN COALESCE(v_target,0) = 0 THEN NULL ELSE round(100 * v_value / v_target, 2) END
    WHEN 'weighted' THEN CASE WHEN COALESCE(v_weight,0) = 0 THEN NULL ELSE (
        SELECT round(sum(NULLIF(r.values->>v_def.value_column_key,'')::numeric * NULLIF(r.values->>v_def.weight_column_key,'')::numeric) / v_weight, 4)
        FROM public.org_kpi_dataset_rows r
        WHERE r.dataset_id = p_dataset_id AND r.review_year = p_review_year
          AND (p_review_period IS NULL OR r.review_period = p_review_period)
      ) END
    WHEN 'last' THEN (
        SELECT NULLIF(r.values->>v_def.value_column_key,'')::numeric FROM public.org_kpi_dataset_rows r
        WHERE r.dataset_id = p_dataset_id AND r.review_year = p_review_year
          AND (p_review_period IS NULL OR r.review_period = p_review_period)
        ORDER BY r.period_start DESC NULLS LAST, r.updated_at DESC LIMIT 1)
    WHEN 'max' THEN (SELECT max(NULLIF(r.values->>v_def.value_column_key,'')::numeric) FROM public.org_kpi_dataset_rows r
        WHERE r.dataset_id = p_dataset_id AND r.review_year = p_review_year
          AND (p_review_period IS NULL OR r.review_period = p_review_period))
    WHEN 'min' THEN (SELECT min(NULLIF(r.values->>v_def.value_column_key,'')::numeric) FROM public.org_kpi_dataset_rows r
        WHERE r.dataset_id = p_dataset_id AND r.review_year = p_review_year
          AND (p_review_period IS NULL OR r.review_period = p_review_period))
    ELSE NULL END;

  RETURN jsonb_build_object(
    'value', v_result, 'row_count', v_count, 'rule', v_def.rollup_rule,
    'sum_value', v_value, 'sum_target', v_target, 'sum_weight', v_weight,
    'working', format('%s over %s row(s)', v_def.rollup_rule, v_count)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.org_kpi_dataset_validate(
  p_dataset_id uuid, p_review_year integer, p_review_period text,
  p_verdict text DEFAULT 'validated', p_note text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_user uuid := auth.uid(); v_count int; v_id uuid;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT (public.has_role(v_user,'auditor'::app_role) OR public.has_role(v_user,'hr_pms'::app_role)
          OR public.has_role(v_user,'management'::app_role) OR public.has_role(v_user,'admin'::app_role)) THEN
    RAISE EXCEPTION 'Only Audit, HR PMS, Management or Admin can validate a period';
  END IF;

  SELECT count(*) INTO v_count FROM public.org_kpi_dataset_rows r
  WHERE r.dataset_id = p_dataset_id AND r.review_year = p_review_year AND r.review_period = p_review_period;

  UPDATE public.org_kpi_dataset_validations
     SET invalidated_at = now(), invalidated_reason = 'Superseded by a newer validation'
   WHERE dataset_id = p_dataset_id AND review_year = p_review_year
     AND review_period = p_review_period AND invalidated_at IS NULL;

  INSERT INTO public.org_kpi_dataset_validations (dataset_id, review_period, review_year, verdict, note, row_count, validated_by)
  VALUES (p_dataset_id, p_review_period, p_review_year, COALESCE(p_verdict,'validated'), p_note, v_count, v_user)
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('id', v_id, 'row_count', v_count, 'verdict', COALESCE(p_verdict,'validated'));
END;
$$;

CREATE OR REPLACE FUNCTION public.org_kpi_dataset_validation_state(
  p_dataset_id uuid, p_review_year integer, p_review_period text
) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT COALESCE(to_jsonb(v), 'null'::jsonb) FROM public.org_kpi_dataset_validations v
  WHERE v.dataset_id = p_dataset_id AND v.review_year = p_review_year
    AND v.review_period = p_review_period
  ORDER BY v.validated_at DESC LIMIT 1;
$$;

REVOKE EXECUTE ON FUNCTION public.org_kpi_dataset_get(uuid,text,text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.org_kpi_dataset_upsert_def(jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.org_kpi_dataset_rows_read(uuid,integer,text,integer,integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.org_kpi_dataset_row_save(jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.org_kpi_dataset_row_delete(uuid,text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.org_kpi_dataset_bulk_import(uuid,jsonb,boolean) FROM anon;
REVOKE EXECUTE ON FUNCTION public.org_kpi_dataset_rollup(uuid,integer,text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.org_kpi_dataset_validate(uuid,integer,text,text,text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.org_kpi_dataset_validation_state(uuid,integer,text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.can_read_kpi_dataset_row(uuid, public.org_kpi_dataset_rows) FROM anon;
REVOKE EXECUTE ON FUNCTION public.can_write_kpi_dataset(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.employee_org_scope(uuid) FROM anon;
