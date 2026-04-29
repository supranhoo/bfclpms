
-- Drop any prior schedule with same name (re-run safety)
DO $$
DECLARE v_jobid bigint;
BEGIN
  SELECT jobid INTO v_jobid FROM cron.job WHERE jobname = 'training-overdue-sweep-daily';
  IF v_jobid IS NOT NULL THEN PERFORM cron.unschedule(v_jobid); END IF;
END $$;

SELECT cron.schedule(
  'training-overdue-sweep-daily',
  '0 2 * * *',
  $$
  SELECT net.http_post(
    url := 'https://jdvsvqiyptijplyhmqqn.supabase.co/functions/v1/training-overdue-sweep',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'Authorization','Bearer ' || current_setting('app.settings.service_role_key', true)
    ),
    body := '{}'::jsonb
  ) AS request_id;
  $$
);
