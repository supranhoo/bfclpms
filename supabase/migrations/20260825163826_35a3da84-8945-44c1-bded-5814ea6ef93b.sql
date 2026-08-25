ALTER TABLE public.org_kpi_dataset_columns
  ADD COLUMN IF NOT EXISTS total_rule text;

ALTER TABLE public.org_kpi_dataset_columns DROP CONSTRAINT IF EXISTS okdc_total_rule_chk;
ALTER TABLE public.org_kpi_dataset_columns ADD CONSTRAINT okdc_total_rule_chk
  CHECK (total_rule IS NULL OR total_rule = ANY (ARRAY['sum','avg','derived','none']));

CREATE OR REPLACE FUNCTION public.org_kpi_dataset_upsert_def(p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
        editable_by, formula, display_format, options, sort_order, total_rule
      ) VALUES (
        v_id, v_col->>'column_key', v_col->>'label',
        COALESCE(v_col->>'data_type','number'), v_col->>'unit',
        COALESCE((v_col->>'is_required')::boolean,false),
        COALESCE((v_col->>'is_key')::boolean,false),
        COALESCE(v_col->>'editable_by','provider'),
        v_col->>'formula', v_col->>'display_format',
        COALESCE(v_col->'options','[]'::jsonb),
        COALESCE((v_col->>'sort_order')::int,0),
        NULLIF(v_col->>'total_rule','')
      )
      ON CONFLICT (dataset_id, column_key) DO UPDATE SET
        label = EXCLUDED.label, data_type = EXCLUDED.data_type, unit = EXCLUDED.unit,
        is_required = EXCLUDED.is_required, is_key = EXCLUDED.is_key,
        editable_by = EXCLUDED.editable_by, formula = EXCLUDED.formula,
        display_format = EXCLUDED.display_format, options = EXCLUDED.options,
        sort_order = EXCLUDED.sort_order, total_rule = EXCLUDED.total_rule;
    END LOOP;
    DELETE FROM public.org_kpi_dataset_columns c
    WHERE c.dataset_id = v_id AND NOT (c.column_key = ANY(v_keys));
  END IF;

  RETURN public.org_kpi_dataset_get(v_cat, v_kra, v_kpi);
END;
$function$;