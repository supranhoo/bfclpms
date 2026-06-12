CREATE OR REPLACE FUNCTION public.refresh_safety_analytics()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_started timestamptz := clock_timestamp();
  v_mv text;
  v_mvs text[] := ARRAY[
    'mv_safety_severity_rate',
    'mv_safety_incidents_open_vs_closed',
    'mv_safety_audit_scoreboard',
    'mv_safety_permit_throughput',
    'mv_safety_incident_monthly_trend',
    'mv_safety_recurrence',
    'mv_safety_top_root_causes',
    'mv_safety_dept_risk_trend'
  ];
  v_fallbacks text[] := ARRAY[]::text[];
BEGIN
  FOREACH v_mv IN ARRAY v_mvs LOOP
    BEGIN
      EXECUTE format('REFRESH MATERIALIZED VIEW CONCURRENTLY public.%I', v_mv);
    EXCEPTION
      WHEN feature_not_supported THEN
        -- MV has an expression-based unique index or hasn't been populated yet;
        -- fall back to non-concurrent refresh (brief AccessExclusive lock).
        EXECUTE format('REFRESH MATERIALIZED VIEW public.%I', v_mv);
        v_fallbacks := array_append(v_fallbacks, v_mv);
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'refreshed_at', clock_timestamp(),
    'elapsed_ms', extract(milliseconds from clock_timestamp() - v_started),
    'concurrent_fallbacks', v_fallbacks
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('ok', false, 'error', SQLERRM, 'failed_on', v_mv);
END;
$function$;