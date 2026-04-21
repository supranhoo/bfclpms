-- Helper: resolve the correct cycle anchor label for a given (frequency, month_idx)
CREATE OR REPLACE FUNCTION public.resolve_cycle_anchor(
  p_frequency text,
  p_month_idx int  -- 0-based (Jan=0)
)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  months text[] := ARRAY['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  cycle_len int;
  cycle_start_idx int;
  cycle_end_idx int;
BEGIN
  IF p_frequency IS NULL OR p_month_idx IS NULL OR p_month_idx < 0 OR p_month_idx > 11 THEN
    RETURN NULL;
  END IF;

  cycle_len := CASE trim(p_frequency)
    WHEN 'Bi-Monthly' THEN 2
    WHEN 'Quarterly' THEN 3
    WHEN 'Half-Yearly' THEN 6
    WHEN 'Yearly' THEN 12
    ELSE 1
  END;

  IF cycle_len <= 1 THEN
    RETURN NULL;
  END IF;

  -- Standard calendar-aligned cycles (Jan-anchored)
  cycle_start_idx := (p_month_idx / cycle_len) * cycle_len;
  cycle_end_idx := cycle_start_idx + cycle_len - 1;

  IF cycle_len = 12 THEN
    RETURN 'Jan-Dec';
  END IF;

  RETURN months[cycle_start_idx + 1] || '-' || months[cycle_end_idx + 1];
END;
$$;

-- Main repair RPC
CREATE OR REPLACE FUNCTION public.repair_org_kpi_cycle_anchors(
  p_dry_run boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  months text[] := ARRAY['January','February','March','April','May','June',
                          'July','August','September','October','November','December'];
  rec record;
  resolved_anchor text;
  month_idx int;
  total_scanned int := 0;
  total_drift int := 0;
  total_repaired int := 0;
  by_freq jsonb := '{}'::jsonb;
  freq_count int;
  drift_rows jsonb := '[]'::jsonb;
BEGIN
  -- Admin gate
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Unauthorized: admin role required';
  END IF;

  FOR rec IN
    SELECT id, employee_id, frequency, frequency_cycle_start, review_period, review_year,
           kra_name, kpi_name
    FROM public.kpis
    WHERE is_org_level = true
      AND frequency IN ('Bi-Monthly', 'Quarterly', 'Half-Yearly', 'Yearly')
  LOOP
    total_scanned := total_scanned + 1;
    month_idx := array_position(months, rec.review_period) - 1;
    IF month_idx IS NULL OR month_idx < 0 THEN CONTINUE; END IF;

    resolved_anchor := public.resolve_cycle_anchor(rec.frequency, month_idx);
    IF resolved_anchor IS NULL THEN CONTINUE; END IF;

    IF rec.frequency_cycle_start IS DISTINCT FROM resolved_anchor THEN
      total_drift := total_drift + 1;
      freq_count := COALESCE((by_freq ->> rec.frequency)::int, 0);
      by_freq := jsonb_set(by_freq, ARRAY[rec.frequency], to_jsonb(freq_count + 1));

      IF NOT p_dry_run THEN
        UPDATE public.kpis
        SET frequency_cycle_start = resolved_anchor
        WHERE id = rec.id;

        INSERT INTO public.kpi_audit_logs (
          kpi_id, action, old_value, new_value, performed_by, metadata
        ) VALUES (
          rec.id,
          'KPI_CYCLE_ANCHOR_REPAIRED',
          jsonb_build_object('frequency_cycle_start', rec.frequency_cycle_start),
          jsonb_build_object('frequency_cycle_start', resolved_anchor),
          NULL,
          jsonb_build_object(
            'frequency', rec.frequency,
            'review_period', rec.review_period,
            'review_year', rec.review_year,
            'system_action', true
          )
        );
        total_repaired := total_repaired + 1;
      END IF;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'dry_run', p_dry_run,
    'total_scanned', total_scanned,
    'total_drift', total_drift,
    'total_repaired', total_repaired,
    'by_frequency', by_freq
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.repair_org_kpi_cycle_anchors(boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_cycle_anchor(text, int) TO authenticated;