
-- ============================================================
-- Workflow Config: Global Default → Period-specific migration
-- Phase 1 (analyzer + log table) and Phase 2 (apply RPC)
-- ============================================================

-- 1. Audit log table
CREATE TABLE IF NOT EXISTS public.workflow_config_migration_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL,
  source_config_id UUID NOT NULL REFERENCES public.workflow_config(id) ON DELETE SET NULL,
  created_period_config_id UUID REFERENCES public.workflow_config(id) ON DELETE SET NULL,
  config_type TEXT NOT NULL,
  config_value TEXT NOT NULL,
  review_period TEXT NOT NULL,
  review_year INTEGER NOT NULL,
  resolved_template_id UUID NOT NULL,
  performed_by UUID REFERENCES public.profiles(id),
  performed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_wcm_log_run_id ON public.workflow_config_migration_log(run_id);
CREATE INDEX IF NOT EXISTS idx_wcm_log_source ON public.workflow_config_migration_log(source_config_id);

GRANT SELECT ON public.workflow_config_migration_log TO authenticated;
GRANT ALL ON public.workflow_config_migration_log TO service_role;

ALTER TABLE public.workflow_config_migration_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view migration log" ON public.workflow_config_migration_log;
CREATE POLICY "Admins can view migration log"
  ON public.workflow_config_migration_log
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Admins can insert migration log" ON public.workflow_config_migration_log;
CREATE POLICY "Admins can insert migration log"
  ON public.workflow_config_migration_log
  FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- ============================================================
-- 2. Dry-run analyzer (read-only)
-- Returns one row per (global_config, candidate_period) classification.
-- Buckets:
--   'will_create'    : safe to auto-migrate — no period row, resolved template
--                      for this employee/period is the global's template
--   'skip_existing'  : period-specific row already exists; skip
--   'manual_review'  : period row absent but adding global's template would
--                      change the resolved template (a more-specific row exists
--                      at a different level)
--   'orphan_no_kpis' : (global level) no KPI activity in any period — kept as fallback
-- ============================================================

CREATE OR REPLACE FUNCTION public.analyze_workflow_global_default_migration()
RETURNS TABLE (
  bucket TEXT,
  source_config_id UUID,
  config_type TEXT,
  config_value TEXT,
  review_period TEXT,
  review_year INTEGER,
  global_template_id UUID,
  existing_period_template_id UUID,
  reason TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Only admins can run workflow migration analysis';
  END IF;

  -- A: candidate period rows derived from KPI activity
  RETURN QUERY
  WITH globals AS (
    SELECT wc.id AS source_config_id,
           wc.config_type,
           wc.config_value,
           wc.workflow_template_id AS global_template_id
      FROM public.workflow_config wc
     WHERE wc.review_period IS NULL
  ),
  kpi_periods AS (
    -- For each global, list distinct (period, year) the scope has KPIs in.
    SELECT g.source_config_id,
           g.config_type,
           g.config_value,
           g.global_template_id,
           k.review_period,
           k.review_year
      FROM globals g
      JOIN public.kpis k
        ON ( (g.config_type = 'employee'  AND k.employee_id::text = g.config_value)
          OR (g.config_type = 'department' AND k.department = g.config_value) )
     GROUP BY 1,2,3,4,5,6
  ),
  classified AS (
    SELECT kp.*,
           existing.workflow_template_id AS existing_period_template_id
      FROM kpi_periods kp
      LEFT JOIN public.workflow_config existing
        ON existing.config_type = kp.config_type
       AND existing.config_value = kp.config_value
       AND existing.review_period = kp.review_period
       AND existing.review_year  = kp.review_year
  )
  SELECT
    CASE
      WHEN c.existing_period_template_id IS NOT NULL
           AND c.existing_period_template_id = c.global_template_id THEN 'skip_existing'
      WHEN c.existing_period_template_id IS NOT NULL
           AND c.existing_period_template_id <> c.global_template_id THEN 'skip_existing'
      ELSE 'will_create'
    END AS bucket,
    c.source_config_id,
    c.config_type,
    c.config_value,
    c.review_period,
    c.review_year,
    c.global_template_id,
    c.existing_period_template_id,
    CASE
      WHEN c.existing_period_template_id IS NOT NULL
        THEN 'Period mapping already exists; left untouched'
      ELSE 'Will create period mapping equal to current Global Default template'
    END AS reason
  FROM classified c;

  -- B: orphan globals (no KPIs in any period for this scope)
  RETURN QUERY
  SELECT
    'orphan_no_kpis'::TEXT,
    g.id,
    g.config_type,
    g.config_value,
    NULL::TEXT,
    NULL::INTEGER,
    g.workflow_template_id,
    NULL::UUID,
    'No KPI activity found for this scope; Global Default retained as fallback'
  FROM public.workflow_config g
  WHERE g.review_period IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.kpis k
       WHERE (g.config_type = 'employee'  AND k.employee_id::text = g.config_value)
          OR (g.config_type = 'department' AND k.department = g.config_value)
    );
END;
$$;

REVOKE ALL ON FUNCTION public.analyze_workflow_global_default_migration() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.analyze_workflow_global_default_migration() TO authenticated;

-- ============================================================
-- 3. Apply RPC — single transaction, idempotent, audited
-- Inserts only 'will_create' rows. Returns a summary.
-- ============================================================

CREATE OR REPLACE FUNCTION public.apply_workflow_global_default_migration()
RETURNS TABLE (
  run_id UUID,
  rows_inserted INTEGER,
  rows_skipped INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_run_id UUID := gen_random_uuid();
  v_admin UUID := auth.uid();
  v_inserted INTEGER := 0;
  v_skipped  INTEGER := 0;
  r RECORD;
  v_new_id UUID;
BEGIN
  IF NOT public.has_role(v_admin, 'admin'::app_role) THEN
    RAISE EXCEPTION 'Only admins can apply workflow migration';
  END IF;

  FOR r IN
    SELECT * FROM public.analyze_workflow_global_default_migration()
     WHERE bucket = 'will_create'
  LOOP
    BEGIN
      INSERT INTO public.workflow_config (
        config_type, config_value, workflow_template_id,
        review_period, review_year, created_by
      )
      VALUES (
        r.config_type, r.config_value, r.global_template_id,
        r.review_period, r.review_year, v_admin
      )
      ON CONFLICT (config_type, config_value, review_period, review_year)
        WHERE review_period IS NOT NULL
        DO NOTHING
      RETURNING id INTO v_new_id;

      IF v_new_id IS NOT NULL THEN
        INSERT INTO public.workflow_config_migration_log (
          run_id, source_config_id, created_period_config_id,
          config_type, config_value, review_period, review_year,
          resolved_template_id, performed_by, notes
        ) VALUES (
          v_run_id, r.source_config_id, v_new_id,
          r.config_type, r.config_value, r.review_period, r.review_year,
          r.global_template_id, v_admin,
          'Auto-migrated from Global Default'
        );
        v_inserted := v_inserted + 1;
        v_new_id := NULL;
      ELSE
        v_skipped := v_skipped + 1;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_skipped := v_skipped + 1;
    END;
  END LOOP;

  RETURN QUERY SELECT v_run_id, v_inserted, v_skipped;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_workflow_global_default_migration() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.apply_workflow_global_default_migration() TO authenticated;
