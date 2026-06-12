-- Safety module pruning (Hours Worked, SLA Monitor viewer, Training)

-- 1. Backup-coverage denylist (shrink-guard accommodation)
INSERT INTO public.backup_denylist (table_name, reason)
VALUES
  ('safety_hours_worked',         'Hours Worked module removed (business requirement change)'),
  ('safety_training_assignments', 'Training module removed (business requirement change)'),
  ('safety_training_attempts',    'Training module removed (business requirement change)'),
  ('safety_sops',                 'Training module removed (business requirement change)'),
  ('safety_quizzes',              'Training module removed (business requirement change)'),
  ('safety_quiz_questions',       'Training module removed (business requirement change)')
ON CONFLICT (table_name) DO NOTHING;

-- 2. Unregister the daily training-overdue cron job via SECURITY DEFINER RPC
DO $$
BEGIN
  PERFORM cron.unschedule('training-overdue-sweep-daily');
EXCEPTION WHEN OTHERS THEN
  -- Already absent: harmless.
  NULL;
END $$;

-- 3. Drop materialized views before underlying tables
DROP MATERIALIZED VIEW IF EXISTS public.mv_safety_trir CASCADE;
DROP MATERIALIZED VIEW IF EXISTS public.mv_safety_training_compliance CASCADE;

-- 4. Drop the overdue-training RPC
DROP FUNCTION IF EXISTS public.mark_overdue_training_assignments();

-- 5. Drop module-exclusive tables
DROP TABLE IF EXISTS public.safety_training_attempts CASCADE;
DROP TABLE IF EXISTS public.safety_training_assignments CASCADE;
DROP TABLE IF EXISTS public.safety_quiz_questions CASCADE;
DROP TABLE IF EXISTS public.safety_quizzes CASCADE;
DROP TABLE IF EXISTS public.safety_sops CASCADE;
DROP TABLE IF EXISTS public.safety_hours_worked CASCADE;

DROP TYPE IF EXISTS public.safety_training_status;

-- 6. Refresh function with the two removed MVs stripped
CREATE OR REPLACE FUNCTION public.refresh_safety_analytics()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_started timestamptz := clock_timestamp();
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_safety_severity_rate;
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_safety_incidents_open_vs_closed;
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_safety_audit_scoreboard;
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_safety_permit_throughput;
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_safety_incident_monthly_trend;
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_safety_recurrence;
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_safety_top_root_causes;
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_safety_dept_risk_trend;
  RETURN jsonb_build_object('ok', true, 'refreshed_at', clock_timestamp(),
    'elapsed_ms', extract(milliseconds from clock_timestamp() - v_started));
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$$;
GRANT EXECUTE ON FUNCTION public.refresh_safety_analytics() TO authenticated, service_role;

-- 7. Remove obsolete permission keys (cascades to safety_role_permissions
--    and safety_user_permission_overrides).
DELETE FROM public.safety_permission_keys
WHERE key IN (
  'nav.training_my', 'nav.training_admin', 'nav.hours_worked', 'nav.sla_monitor',
  'action.training.view', 'action.training.assign', 'action.training.complete',
  'action.training.administer', 'widget.training'
);

-- 8. Remove obsolete settings rows
DELETE FROM public.safety_settings
WHERE key IN ('training_overdue_escalation_days', 'ui_safety_sla_v2');