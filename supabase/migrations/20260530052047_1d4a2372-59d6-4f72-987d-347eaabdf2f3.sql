-- Phase 10: Safety Analytics v2 – monthly trend MV
DROP MATERIALIZED VIEW IF EXISTS public.mv_safety_incident_monthly_trend CASCADE;
CREATE MATERIALIZED VIEW public.mv_safety_incident_monthly_trend AS
WITH months AS (
  SELECT generate_series(
    date_trunc('month', now()) - interval '11 months',
    date_trunc('month', now()),
    interval '1 month'
  )::date AS month_start
),
bu AS (
  SELECT DISTINCT business_unit_id
  FROM public.safety_incidents
  WHERE created_at >= (date_trunc('month', now()) - interval '12 months')
),
grid AS (
  SELECT m.month_start, b.business_unit_id
  FROM months m CROSS JOIN bu b
),
agg AS (
  SELECT
    date_trunc('month', created_at)::date AS month_start,
    business_unit_id,
    COUNT(*)                                                                  AS total_count,
    COUNT(*) FILTER (WHERE severity = 'critical')                             AS critical_count,
    COUNT(*) FILTER (WHERE severity = 'high')                                 AS high_count,
    COUNT(*) FILTER (WHERE severity = 'medium')                               AS medium_count,
    COUNT(*) FILTER (WHERE severity = 'low')                                  AS low_count,
    COUNT(*) FILTER (WHERE incident_type IN ('accident','property_damage'))   AS recordable_count,
    COUNT(*) FILTER (WHERE status = 'closed')                                 AS closed_count
  FROM public.safety_incidents
  WHERE created_at >= (date_trunc('month', now()) - interval '12 months')
  GROUP BY 1, 2
)
SELECT
  g.month_start,
  EXTRACT(YEAR  FROM g.month_start)::int AS period_year,
  EXTRACT(MONTH FROM g.month_start)::int AS period_month,
  g.business_unit_id,
  COALESCE(a.total_count, 0)      AS total_count,
  COALESCE(a.critical_count, 0)   AS critical_count,
  COALESCE(a.high_count, 0)       AS high_count,
  COALESCE(a.medium_count, 0)     AS medium_count,
  COALESCE(a.low_count, 0)        AS low_count,
  COALESCE(a.recordable_count, 0) AS recordable_count,
  COALESCE(a.closed_count, 0)     AS closed_count,
  now() AS refreshed_at
FROM grid g
LEFT JOIN agg a
  ON a.month_start = g.month_start
 AND a.business_unit_id IS NOT DISTINCT FROM g.business_unit_id;

CREATE UNIQUE INDEX idx_mv_safety_trend_bu_month
  ON public.mv_safety_incident_monthly_trend (
    COALESCE(business_unit_id, '00000000-0000-0000-0000-000000000000'::uuid),
    month_start
  );

GRANT SELECT ON public.mv_safety_incident_monthly_trend TO authenticated;

-- Extend refresh function to include the new MV
CREATE OR REPLACE FUNCTION public.refresh_safety_analytics()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT (
    public.has_safety_role(auth.uid(), 'admin')
    OR public.has_safety_role(auth.uid(), 'safety_head')
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'forbidden');
  END IF;

  REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_safety_trir;
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_safety_severity_rate;
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_safety_incidents_open_vs_closed;
  REFRESH MATERIALIZED VIEW public.mv_safety_training_compliance;
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_safety_audit_scoreboard;
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_safety_permit_throughput;
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_safety_incident_monthly_trend;

  RETURN jsonb_build_object('ok', true, 'refreshed_at', now());
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$$;

-- Seed the v2 feature flag (default OFF)
INSERT INTO public.safety_settings (key, value, description)
VALUES (
  'ui_safety_analytics_v2',
  to_jsonb(false),
  'Phase 10 – when true, render Safety Analytics v2 sections (monthly trend chart, color-coded heatmap, KPI drill-downs).'
)
ON CONFLICT (key) DO NOTHING;