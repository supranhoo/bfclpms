CREATE OR REPLACE FUNCTION public.org_kpi_dataset_row_save(p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_dataset uuid := (p_payload->>'dataset_id')::uuid;
  v_id uuid := NULLIF(p_payload->>'id','')::uuid;
  v_source text := NULLIF(p_payload->>'source','');
  v_old public.org_kpi_dataset_rows;
  v_new public.org_kpi_dataset_rows;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT public.can_write_kpi_dataset(v_user, v_dataset) THEN
    RAISE EXCEPTION 'Not authorised to enter data for this KPI';
  END IF;
  IF v_source IS NOT NULL AND v_source NOT IN ('entry','import','legacy') THEN
    RAISE EXCEPTION 'Unknown row source %', v_source;
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
      source = COALESCE(v_source, source),
      revision = revision + 1,
      updated_by = v_user
    WHERE id = v_id RETURNING * INTO v_new;

    INSERT INTO public.org_kpi_dataset_row_history (row_id, dataset_id, revision, action, old_values, new_values, reason, performed_by)
    VALUES (v_id, v_dataset, v_new.revision, 'update', v_old.values, v_new.values, p_payload->>'reason', v_user);
  ELSE
    INSERT INTO public.org_kpi_dataset_rows (
      dataset_id, review_period, review_year, period_start,
      division_id, business_unit_id, department_id, location_id, pms_grade_id, level_id, employee_id,
      scope_label, impact_scope, values, source, entered_by, updated_by
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
      COALESCE(v_source, 'entry'),
      v_user, v_user
    ) RETURNING * INTO v_new;

    INSERT INTO public.org_kpi_dataset_row_history (row_id, dataset_id, revision, action, old_values, new_values, reason, performed_by)
    VALUES (v_new.id, v_dataset, 1, 'create', NULL, v_new.values, p_payload->>'reason', v_user);
  END IF;

  RETURN to_jsonb(v_new);
END;
$function$;