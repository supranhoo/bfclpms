
-- =========================================================================
-- Phase 1: safety_master_data reference table
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.safety_master_data (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category text NOT NULL,
  code text NOT NULL,
  label text NOT NULL,
  parent_id uuid NULL REFERENCES public.safety_master_data(id) ON DELETE SET NULL,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NULL,
  CONSTRAINT safety_master_data_unique_code UNIQUE (category, code)
);

GRANT SELECT ON public.safety_master_data TO authenticated;
GRANT ALL ON public.safety_master_data TO service_role;

ALTER TABLE public.safety_master_data ENABLE ROW LEVEL SECURITY;

-- Read: any authenticated user with module access
CREATE POLICY "safety_master_data_read"
  ON public.safety_master_data FOR SELECT
  TO authenticated
  USING (public.has_safety_module_access(auth.uid()));

-- Write: admin or safety_head only
CREATE POLICY "safety_master_data_insert"
  ON public.safety_master_data FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_safety_role(auth.uid(), 'admin'::public.safety_app_role)
    OR public.has_safety_role(auth.uid(), 'safety_head'::public.safety_app_role)
  );
CREATE POLICY "safety_master_data_update"
  ON public.safety_master_data FOR UPDATE
  TO authenticated
  USING (
    public.has_safety_role(auth.uid(), 'admin'::public.safety_app_role)
    OR public.has_safety_role(auth.uid(), 'safety_head'::public.safety_app_role)
  )
  WITH CHECK (
    public.has_safety_role(auth.uid(), 'admin'::public.safety_app_role)
    OR public.has_safety_role(auth.uid(), 'safety_head'::public.safety_app_role)
  );
CREATE POLICY "safety_master_data_delete"
  ON public.safety_master_data FOR DELETE
  TO authenticated
  USING (
    public.has_safety_role(auth.uid(), 'admin'::public.safety_app_role)
    OR public.has_safety_role(auth.uid(), 'safety_head'::public.safety_app_role)
  );

CREATE INDEX IF NOT EXISTS idx_safety_master_data_category
  ON public.safety_master_data(category, is_active, sort_order);

CREATE TRIGGER trg_safety_master_data_updated_at
  BEFORE UPDATE ON public.safety_master_data
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

COMMENT ON TABLE public.safety_master_data IS
  'Generic categorized reference data for the Safety module (root causes, PPE types, hazard classes, etc.). Admin/Safety Head write; module-access read.';

-- =========================================================================
-- Phase 1: Analytics materialized views (12-month rolling)
-- =========================================================================
CREATE MATERIALIZED VIEW IF NOT EXISTS public.mv_safety_recurrence AS
SELECT
  COALESCE(NULLIF(trim(location), ''), '(unspecified)') AS location_label,
  incident_type::text AS incident_type,
  business_unit_id,
  department_id,
  count(*)::int AS occurrences,
  max(occurred_at) AS last_occurred_at
FROM public.safety_incidents
WHERE occurred_at >= (now() - interval '12 months')
GROUP BY 1, 2, 3, 4
HAVING count(*) > 1;

CREATE UNIQUE INDEX IF NOT EXISTS uq_mv_safety_recurrence
  ON public.mv_safety_recurrence (location_label, incident_type, COALESCE(business_unit_id, '00000000-0000-0000-0000-000000000000'::uuid), COALESCE(department_id, '00000000-0000-0000-0000-000000000000'::uuid));

CREATE MATERIALIZED VIEW IF NOT EXISTS public.mv_safety_top_root_causes AS
SELECT
  incident_type::text AS cause,
  severity::text AS severity,
  count(*)::int AS incidents
FROM public.safety_incidents
WHERE occurred_at >= (now() - interval '12 months')
GROUP BY 1, 2;

CREATE UNIQUE INDEX IF NOT EXISTS uq_mv_safety_top_root_causes
  ON public.mv_safety_top_root_causes (cause, severity);

CREATE MATERIALIZED VIEW IF NOT EXISTS public.mv_safety_dept_risk_trend AS
SELECT
  department_id,
  date_trunc('month', occurred_at)::date AS month,
  count(*) FILTER (WHERE severity IN ('high'::public.safety_incident_severity, 'critical'::public.safety_incident_severity))::int AS high_severity,
  count(*)::int AS total
FROM public.safety_incidents
WHERE occurred_at >= (now() - interval '12 months')
GROUP BY 1, 2;

CREATE UNIQUE INDEX IF NOT EXISTS uq_mv_safety_dept_risk_trend
  ON public.mv_safety_dept_risk_trend (COALESCE(department_id, '00000000-0000-0000-0000-000000000000'::uuid), month);

-- Revoke public/anon access; grant authenticated read (matches existing MV posture)
REVOKE ALL ON public.mv_safety_recurrence FROM PUBLIC, anon;
REVOKE ALL ON public.mv_safety_top_root_causes FROM PUBLIC, anon;
REVOKE ALL ON public.mv_safety_dept_risk_trend FROM PUBLIC, anon;
GRANT SELECT ON public.mv_safety_recurrence TO authenticated;
GRANT SELECT ON public.mv_safety_top_root_causes TO authenticated;
GRANT SELECT ON public.mv_safety_dept_risk_trend TO authenticated;

-- Supporting index for at-risk roster scan
CREATE INDEX IF NOT EXISTS idx_safety_incidents_assigned_status
  ON public.safety_incidents(assigned_to, status)
  WHERE status <> 'closed';

-- =========================================================================
-- Phase 1: RPC wrappers (prototype-parity names)
-- =========================================================================
CREATE OR REPLACE FUNCTION public.safety_analytics_recurrence(p_department uuid DEFAULT NULL)
RETURNS TABLE (
  location_label text,
  incident_type text,
  business_unit_id uuid,
  department_id uuid,
  occurrences int,
  last_occurred_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT location_label, incident_type, business_unit_id, department_id, occurrences, last_occurred_at
  FROM public.mv_safety_recurrence
  WHERE public.has_safety_module_access(auth.uid())
    AND (p_department IS NULL OR department_id = p_department)
  ORDER BY occurrences DESC, last_occurred_at DESC
  LIMIT 500;
$$;

CREATE OR REPLACE FUNCTION public.safety_analytics_top_root_causes(p_limit int DEFAULT 10)
RETURNS TABLE (cause text, severity text, incidents int)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT cause, severity, incidents
  FROM public.mv_safety_top_root_causes
  WHERE public.has_safety_module_access(auth.uid())
  ORDER BY incidents DESC
  LIMIT GREATEST(COALESCE(p_limit, 10), 1);
$$;

CREATE OR REPLACE FUNCTION public.safety_analytics_dept_risk_trend(p_months int DEFAULT 12)
RETURNS TABLE (department_id uuid, month date, high_severity int, total int)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT department_id, month, high_severity, total
  FROM public.mv_safety_dept_risk_trend
  WHERE public.has_safety_module_access(auth.uid())
    AND month >= (date_trunc('month', now()) - (GREATEST(COALESCE(p_months, 12), 1) || ' months')::interval)::date
  ORDER BY month ASC, department_id;
$$;

CREATE OR REPLACE FUNCTION public.safety_dashboard_at_risk(p_threshold int DEFAULT 3)
RETURNS TABLE (
  assigned_to uuid,
  open_count int,
  red_count int,
  amber_count int,
  worst_sla text,
  oldest_open_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH base AS (
    SELECT
      v.assigned_to,
      v.sla_state,
      v.created_at
    FROM public.safety_incidents_with_sla v
    WHERE v.status <> 'closed'
      AND v.assigned_to IS NOT NULL
      AND public.has_safety_module_access(auth.uid())
  )
  SELECT
    assigned_to,
    count(*)::int AS open_count,
    count(*) FILTER (WHERE sla_state = 'red')::int AS red_count,
    count(*) FILTER (WHERE sla_state = 'amber')::int AS amber_count,
    CASE
      WHEN count(*) FILTER (WHERE sla_state = 'red') > 0 THEN 'red'
      WHEN count(*) FILTER (WHERE sla_state = 'amber') > 0 THEN 'amber'
      ELSE 'green'
    END AS worst_sla,
    min(created_at) AS oldest_open_at
  FROM base
  GROUP BY assigned_to
  HAVING count(*) >= GREATEST(COALESCE(p_threshold, 3), 1)
     OR count(*) FILTER (WHERE sla_state = 'red') > 0
  ORDER BY red_count DESC, open_count DESC
  LIMIT 200;
$$;

REVOKE ALL ON FUNCTION public.safety_analytics_recurrence(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.safety_analytics_top_root_causes(int) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.safety_analytics_dept_risk_trend(int) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.safety_dashboard_at_risk(int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.safety_analytics_recurrence(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.safety_analytics_top_root_causes(int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.safety_analytics_dept_risk_trend(int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.safety_dashboard_at_risk(int) TO authenticated;

-- =========================================================================
-- Extend refresh_safety_analytics to include the 3 new MVs
-- =========================================================================
CREATE OR REPLACE FUNCTION public.refresh_safety_analytics()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_started_at timestamptz := clock_timestamp();
BEGIN
  REFRESH MATERIALIZED VIEW public.mv_safety_trir;
  REFRESH MATERIALIZED VIEW public.mv_safety_severity_rate;
  REFRESH MATERIALIZED VIEW public.mv_safety_incidents_open_vs_closed;
  REFRESH MATERIALIZED VIEW public.mv_safety_training_compliance;
  REFRESH MATERIALIZED VIEW public.mv_safety_audit_scoreboard;
  REFRESH MATERIALIZED VIEW public.mv_safety_permit_throughput;
  REFRESH MATERIALIZED VIEW public.mv_safety_incident_monthly_trend;
  REFRESH MATERIALIZED VIEW public.mv_safety_recurrence;
  REFRESH MATERIALIZED VIEW public.mv_safety_top_root_causes;
  REFRESH MATERIALIZED VIEW public.mv_safety_dept_risk_trend;

  RETURN jsonb_build_object(
    'ok', true,
    'refreshed_at', now(),
    'duration_ms', extract(milliseconds FROM clock_timestamp() - v_started_at)
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$$;

REVOKE ALL ON FUNCTION public.refresh_safety_analytics() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.refresh_safety_analytics() TO authenticated;
