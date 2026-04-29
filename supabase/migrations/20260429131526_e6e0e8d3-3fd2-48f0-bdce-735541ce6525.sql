
CREATE TABLE IF NOT EXISTS public.safety_hours_worked (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_unit_id uuid REFERENCES public.business_units(id) ON DELETE CASCADE,
  period_year integer NOT NULL,
  period_month integer NOT NULL CHECK (period_month BETWEEN 1 AND 12),
  hours_worked numeric(12,2) NOT NULL CHECK (hours_worked >= 0),
  headcount integer,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  UNIQUE (business_unit_id, period_year, period_month)
);

CREATE INDEX IF NOT EXISTS idx_safety_hours_bu_period
  ON public.safety_hours_worked(business_unit_id, period_year, period_month);

ALTER TABLE public.safety_hours_worked ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.safety_hours_worked REPLICA IDENTITY FULL;

CREATE POLICY safety_hours_select
  ON public.safety_hours_worked FOR SELECT
  TO authenticated
  USING (
    public.has_safety_role(auth.uid(), 'admin')
    OR public.has_safety_role(auth.uid(), 'safety_head')
    OR public.has_safety_role(auth.uid(), 'safety_officer')
  );

CREATE POLICY safety_hours_write
  ON public.safety_hours_worked FOR ALL
  TO authenticated
  USING (
    public.has_safety_role(auth.uid(), 'admin')
    OR public.has_safety_role(auth.uid(), 'safety_head')
  )
  WITH CHECK (
    public.has_safety_role(auth.uid(), 'admin')
    OR public.has_safety_role(auth.uid(), 'safety_head')
  );

DROP MATERIALIZED VIEW IF EXISTS public.mv_safety_trir CASCADE;
CREATE MATERIALIZED VIEW public.mv_safety_trir AS
WITH cutoff AS (
  SELECT (date_trunc('month', now()) - interval '12 months')::date AS d_from,
         (date_trunc('month', now()))::date AS d_to
),
hours AS (
  SELECT business_unit_id, SUM(hours_worked) AS hours_worked
  FROM public.safety_hours_worked, cutoff
  WHERE make_date(period_year, period_month, 1) >= cutoff.d_from
    AND make_date(period_year, period_month, 1) < cutoff.d_to
  GROUP BY business_unit_id
),
recordables AS (
  SELECT business_unit_id, COUNT(*) AS recordable_cases
  FROM public.safety_incidents, cutoff
  WHERE incident_type IN ('accident','property_damage')
    AND created_at >= cutoff.d_from
    AND created_at < cutoff.d_to
  GROUP BY business_unit_id
)
SELECT
  COALESCE(h.business_unit_id, r.business_unit_id) AS business_unit_id,
  COALESCE(h.hours_worked, 0) AS hours_worked,
  COALESCE(r.recordable_cases, 0) AS recordable_cases,
  CASE
    WHEN COALESCE(h.hours_worked, 0) > 0
    THEN ROUND((COALESCE(r.recordable_cases, 0) * 200000.0) / h.hours_worked, 2)
    ELSE NULL
  END AS trir,
  now() AS refreshed_at
FROM hours h
FULL OUTER JOIN recordables r ON r.business_unit_id = h.business_unit_id;
CREATE UNIQUE INDEX idx_mv_safety_trir_bu ON public.mv_safety_trir(business_unit_id);

DROP MATERIALIZED VIEW IF EXISTS public.mv_safety_severity_rate CASCADE;
CREATE MATERIALIZED VIEW public.mv_safety_severity_rate AS
SELECT
  business_unit_id,
  COUNT(*) FILTER (WHERE severity = 'critical') AS critical_count,
  COUNT(*) FILTER (WHERE severity = 'high')     AS high_count,
  COUNT(*) FILTER (WHERE severity = 'medium')   AS medium_count,
  COUNT(*) FILTER (WHERE severity = 'low')      AS low_count,
  COUNT(*) AS total_count,
  now() AS refreshed_at
FROM public.safety_incidents
WHERE created_at >= (date_trunc('month', now()) - interval '12 months')
GROUP BY business_unit_id;
CREATE UNIQUE INDEX idx_mv_safety_sev_bu ON public.mv_safety_severity_rate(business_unit_id);

DROP MATERIALIZED VIEW IF EXISTS public.mv_safety_incidents_open_vs_closed CASCADE;
CREATE MATERIALIZED VIEW public.mv_safety_incidents_open_vs_closed AS
SELECT
  business_unit_id,
  COUNT(*) FILTER (WHERE status = 'closed') AS closed_count,
  COUNT(*) FILTER (WHERE status NOT IN ('closed','orphaned')) AS open_count,
  COUNT(*) FILTER (WHERE status = 'orphaned') AS orphaned_count,
  now() AS refreshed_at
FROM public.safety_incidents
WHERE created_at >= (date_trunc('month', now()) - interval '12 months')
GROUP BY business_unit_id;
CREATE UNIQUE INDEX idx_mv_safety_oc_bu ON public.mv_safety_incidents_open_vs_closed(business_unit_id);

DROP MATERIALIZED VIEW IF EXISTS public.mv_safety_training_compliance CASCADE;
CREATE MATERIALIZED VIEW public.mv_safety_training_compliance AS
SELECT
  COUNT(*) AS total_assignments,
  COUNT(*) FILTER (WHERE status = 'passed') AS passed_count,
  COUNT(*) FILTER (WHERE status = 'overdue') AS overdue_count,
  CASE WHEN COUNT(*) > 0
       THEN ROUND(100.0 * COUNT(*) FILTER (WHERE status = 'passed') / COUNT(*), 1)
       ELSE NULL END AS compliance_pct,
  now() AS refreshed_at
FROM public.safety_training_assignments;

DROP MATERIALIZED VIEW IF EXISTS public.mv_safety_audit_scoreboard CASCADE;
CREATE MATERIALIZED VIEW public.mv_safety_audit_scoreboard AS
SELECT
  business_unit_id,
  COUNT(*) AS run_count,
  ROUND(AVG(score)::numeric, 1) AS avg_score,
  COUNT(*) FILTER (WHERE score >= 90) AS excellent_count,
  COUNT(*) FILTER (WHERE score >= 75 AND score < 90) AS good_count,
  COUNT(*) FILTER (WHERE score < 75) AS poor_count,
  now() AS refreshed_at
FROM public.safety_audit_runs
WHERE status IN ('submitted','reviewed')
  AND conducted_at >= (now() - interval '12 months')
GROUP BY business_unit_id;
CREATE UNIQUE INDEX idx_mv_safety_audit_bu ON public.mv_safety_audit_scoreboard(business_unit_id);

DROP MATERIALIZED VIEW IF EXISTS public.mv_safety_permit_throughput CASCADE;
CREATE MATERIALIZED VIEW public.mv_safety_permit_throughput AS
SELECT
  business_unit_id,
  COUNT(*) AS total_permits,
  COUNT(*) FILTER (WHERE status IN ('approved','active','closed')) AS approved_count,
  COUNT(*) FILTER (WHERE status = 'active') AS active_count,
  COUNT(*) FILTER (WHERE status = 'expired') AS expired_count,
  COUNT(*) FILTER (WHERE status = 'rejected') AS rejected_count,
  now() AS refreshed_at
FROM public.safety_permits
WHERE created_at >= (now() - interval '90 days')
GROUP BY business_unit_id;
CREATE UNIQUE INDEX idx_mv_safety_permit_bu ON public.mv_safety_permit_throughput(business_unit_id);

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

  RETURN jsonb_build_object('ok', true, 'refreshed_at', now());
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.refresh_safety_analytics() TO authenticated;
GRANT SELECT ON public.mv_safety_trir TO authenticated;
GRANT SELECT ON public.mv_safety_severity_rate TO authenticated;
GRANT SELECT ON public.mv_safety_incidents_open_vs_closed TO authenticated;
GRANT SELECT ON public.mv_safety_training_compliance TO authenticated;
GRANT SELECT ON public.mv_safety_audit_scoreboard TO authenticated;
GRANT SELECT ON public.mv_safety_permit_throughput TO authenticated;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'safety-analytics-refresh-30min') THEN
      PERFORM cron.unschedule('safety-analytics-refresh-30min');
    END IF;
    PERFORM cron.schedule(
      'safety-analytics-refresh-30min',
      '*/30 * * * *',
      $cron$ SELECT public.refresh_safety_analytics(); $cron$
    );
  END IF;
END $$;
