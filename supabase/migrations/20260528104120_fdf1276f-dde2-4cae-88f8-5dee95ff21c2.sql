CREATE OR REPLACE FUNCTION public.batch_insert_kpis_with_rollover_flag(kpis_json jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  inserted_count integer;
BEGIN
  PERFORM set_config('app.rollover_batch', 'true', true);

  INSERT INTO public.kpis (
    employee_id, category_id, kra_name, kpi_name, target_value, uom, uom_type,
    weightage, frequency, sub_frequency, criteria, source_of_data,
    r5, r4, r3, r2, r1, r0, threshold_mode, qualitative_options,
    is_org_level, org_level_scope, ref_code, day_count_type,
    frequency_cycle_start, require_resubmit_reason,
    review_period, review_year, status
  )
  SELECT
    (kpi->>'employee_id')::uuid,
    (kpi->>'category_id')::uuid,
    kpi->>'kra_name',
    kpi->>'kpi_name',
    (kpi->>'target_value')::numeric,
    kpi->>'uom',
    kpi->>'uom_type',
    (kpi->>'weightage')::numeric,
    kpi->>'frequency',
    kpi->>'sub_frequency',
    kpi->>'criteria',
    kpi->>'source_of_data',
    kpi->>'r5',
    kpi->>'r4',
    kpi->>'r3',
    kpi->>'r2',
    kpi->>'r1',
    kpi->>'r0',
    kpi->>'threshold_mode',
    CASE WHEN kpi->'qualitative_options' IS NOT NULL AND kpi->>'qualitative_options' != 'null' THEN kpi->'qualitative_options' ELSE NULL END,
    COALESCE((kpi->>'is_org_level')::boolean, false),
    kpi->>'org_level_scope',
    kpi->>'ref_code',
    kpi->>'day_count_type',
    kpi->>'frequency_cycle_start',
    COALESCE((kpi->>'require_resubmit_reason')::boolean, false),
    kpi->>'review_period',
    (kpi->>'review_year')::integer,
    COALESCE(NULLIF(kpi->>'status',''), 'kra_set')::public.review_status
  FROM jsonb_array_elements(kpis_json) AS kpi;

  GET DIAGNOSTICS inserted_count = ROW_COUNT;
  RETURN inserted_count;
END;
$function$;