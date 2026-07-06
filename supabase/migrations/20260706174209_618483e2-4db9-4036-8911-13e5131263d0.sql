
-- Admin-only: re-anchor Bi-Monthly KPIs for selected employees.
-- June 2026 rows -> frequency='Monthly', frequency_cycle_start=NULL
-- July 2026 rows -> frequency_cycle_start='Jul-Aug' (frequency unchanged)
CREATE OR REPLACE FUNCTION public.rebatch_bimonthly_reanchor(
  p_employee_ids uuid[],
  p_dry_run boolean DEFAULT true
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_batch_id uuid := gen_random_uuid();
  v_actor uuid := auth.uid();
  v_is_admin boolean;
  v_june_rows jsonb;
  v_july_rows jsonb;
  v_june_count int := 0;
  v_july_count int := 0;
BEGIN
  -- authz
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = v_actor AND ur.role = 'admin'
  ) INTO v_is_admin;
  IF NOT v_is_admin THEN
    RAISE EXCEPTION 'not_authorized: admin role required';
  END IF;

  IF p_employee_ids IS NULL OR array_length(p_employee_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'p_employee_ids must not be empty';
  END IF;

  -- Preview payloads
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'kpi_id', k.id,
    'employee_id', k.employee_id,
    'kpi_name', k.kpi_name,
    'kra_name', k.kra_name,
    'review_period', k.review_period,
    'review_year', k.review_year,
    'frequency', k.frequency,
    'frequency_cycle_start', k.frequency_cycle_start
  )), '[]'::jsonb), COUNT(*)
  INTO v_june_rows, v_june_count
  FROM public.kpis k
  WHERE k.employee_id = ANY(p_employee_ids)
    AND k.frequency = 'Bi-Monthly'
    AND k.review_period = 'June'
    AND k.review_year = 2026;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'kpi_id', k.id,
    'employee_id', k.employee_id,
    'kpi_name', k.kpi_name,
    'kra_name', k.kra_name,
    'review_period', k.review_period,
    'review_year', k.review_year,
    'frequency', k.frequency,
    'frequency_cycle_start', k.frequency_cycle_start
  )), '[]'::jsonb), COUNT(*)
  INTO v_july_rows, v_july_count
  FROM public.kpis k
  WHERE k.employee_id = ANY(p_employee_ids)
    AND k.frequency = 'Bi-Monthly'
    AND k.review_period = 'July'
    AND k.review_year = 2026;

  IF p_dry_run THEN
    RETURN jsonb_build_object(
      'dry_run', true,
      'batch_id', NULL,
      'june_count', v_june_count,
      'july_count', v_july_count,
      'june_rows', v_june_rows,
      'july_rows', v_july_rows
    );
  END IF;

  -- Audit BEFORE update so old values are captured
  INSERT INTO public.kpi_audit_logs (kpi_id, action, performed_by, old_value, new_value, metadata)
  SELECT
    k.id,
    'KPI_BIMONTHLY_REANCHOR',
    v_actor,
    jsonb_build_object('frequency', k.frequency, 'frequency_cycle_start', k.frequency_cycle_start),
    jsonb_build_object('frequency', 'Monthly', 'frequency_cycle_start', NULL),
    jsonb_build_object('batch_id', v_batch_id, 'phase', 'june_to_monthly', 'review_period', k.review_period, 'review_year', k.review_year)
  FROM public.kpis k
  WHERE k.employee_id = ANY(p_employee_ids)
    AND k.frequency = 'Bi-Monthly'
    AND k.review_period = 'June'
    AND k.review_year = 2026;

  INSERT INTO public.kpi_audit_logs (kpi_id, action, performed_by, old_value, new_value, metadata)
  SELECT
    k.id,
    'KPI_BIMONTHLY_REANCHOR',
    v_actor,
    jsonb_build_object('frequency', k.frequency, 'frequency_cycle_start', k.frequency_cycle_start),
    jsonb_build_object('frequency', k.frequency, 'frequency_cycle_start', 'Jul-Aug'),
    jsonb_build_object('batch_id', v_batch_id, 'phase', 'july_reanchor', 'review_period', k.review_period, 'review_year', k.review_year)
  FROM public.kpis k
  WHERE k.employee_id = ANY(p_employee_ids)
    AND k.frequency = 'Bi-Monthly'
    AND k.review_period = 'July'
    AND k.review_year = 2026;

  -- Apply updates
  UPDATE public.kpis
  SET frequency = 'Monthly', frequency_cycle_start = NULL, sub_frequency = NULL, updated_at = now()
  WHERE employee_id = ANY(p_employee_ids)
    AND frequency = 'Bi-Monthly'
    AND review_period = 'June'
    AND review_year = 2026;

  UPDATE public.kpis
  SET frequency_cycle_start = 'Jul-Aug', updated_at = now()
  WHERE employee_id = ANY(p_employee_ids)
    AND frequency = 'Bi-Monthly'
    AND review_period = 'July'
    AND review_year = 2026;

  RETURN jsonb_build_object(
    'dry_run', false,
    'batch_id', v_batch_id,
    'june_count', v_june_count,
    'july_count', v_july_count
  );
END;
$$;

REVOKE ALL ON FUNCTION public.rebatch_bimonthly_reanchor(uuid[], boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rebatch_bimonthly_reanchor(uuid[], boolean) TO authenticated;

-- Revert a previously applied re-anchor batch by restoring `old_value` from audit rows.
CREATE OR REPLACE FUNCTION public.revert_bimonthly_reanchor(
  p_batch_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_is_admin boolean;
  v_restored int := 0;
  r record;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = v_actor AND ur.role = 'admin'
  ) INTO v_is_admin;
  IF NOT v_is_admin THEN
    RAISE EXCEPTION 'not_authorized: admin role required';
  END IF;

  FOR r IN
    SELECT kpi_id, old_value
    FROM public.kpi_audit_logs
    WHERE action = 'KPI_BIMONTHLY_REANCHOR'
      AND metadata->>'batch_id' = p_batch_id::text
  LOOP
    UPDATE public.kpis
    SET frequency = COALESCE(r.old_value->>'frequency', frequency),
        frequency_cycle_start = NULLIF(r.old_value->>'frequency_cycle_start', ''),
        updated_at = now()
    WHERE id = r.kpi_id;

    INSERT INTO public.kpi_audit_logs (kpi_id, action, performed_by, old_value, new_value, metadata)
    VALUES (
      r.kpi_id,
      'KPI_BIMONTHLY_REANCHOR_REVERTED',
      v_actor,
      NULL,
      r.old_value,
      jsonb_build_object('batch_id', p_batch_id)
    );
    v_restored := v_restored + 1;
  END LOOP;

  RETURN jsonb_build_object('batch_id', p_batch_id, 'restored', v_restored);
END;
$$;

REVOKE ALL ON FUNCTION public.revert_bimonthly_reanchor(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.revert_bimonthly_reanchor(uuid) TO authenticated;
