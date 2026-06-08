
-- Idempotent re-schedule helper: drop the old job by name if it exists, then schedule the new one.
-- Bodies/URLs/headers are preserved verbatim from the current cron.job rows.

-- 1. compress-evidence: every 2 min → once daily 03:30 UTC, renamed.
DO $$ BEGIN
  PERFORM cron.unschedule('compress-evidence-every-2min');
EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN
  PERFORM cron.unschedule('compress-evidence-daily');
EXCEPTION WHEN OTHERS THEN NULL; END $$;
SELECT cron.schedule(
  'compress-evidence-daily',
  '30 3 * * *',
  $cron$
  SELECT net.http_post(
    url:='https://jdvsvqiyptijplyhmqqn.supabase.co/functions/v1/compress-evidence',
    headers:='{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpkdnN2cWl5cHRpanBseWhtcXFuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYyMjA0MjQsImV4cCI6MjA4MTc5NjQyNH0.T8egtqpDIhC84CM3w_Zxwqqe9zjw5ZunYHnnQJ4eut4"}'::jsonb,
    body:=concat('{"trigger":"cron","at":"', now(), '"}')::jsonb
  );
  $cron$
);

-- 2. check-safety-sla: every 5 min → every 15 min, renamed.
DO $$ BEGIN
  PERFORM cron.unschedule('check-safety-sla-every-5min');
EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN
  PERFORM cron.unschedule('check-safety-sla-every-15min');
EXCEPTION WHEN OTHERS THEN NULL; END $$;
SELECT cron.schedule(
  'check-safety-sla-every-15min',
  '*/15 * * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://jdvsvqiyptijplyhmqqn.supabase.co/functions/v1/check-safety-sla',
    headers := '{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpkdnN2cWl5cHRpanBseWhtcXFuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYyMjA0MjQsImV4cCI6MjA4MTc5NjQyNH0.T8egtqpDIhC84CM3w_Zxwqqe9zjw5ZunYHnnQJ4eut4"}'::jsonb,
    body := jsonb_build_object('trigger','cron','at', now())
  ) AS request_id;
  $cron$
);

-- 3. safety-analytics-refresh: every 30 min → every 2 hours, renamed.
DO $$ BEGIN
  PERFORM cron.unschedule('safety-analytics-refresh-30min');
EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN
  PERFORM cron.unschedule('safety-analytics-refresh-2h');
EXCEPTION WHEN OTHERS THEN NULL; END $$;
SELECT cron.schedule(
  'safety-analytics-refresh-2h',
  '0 */2 * * *',
  'SELECT public.refresh_safety_analytics();'
);

-- 4. permit-expiry-sweep: every 15 min → every hour, renamed.
DO $$ BEGIN
  PERFORM cron.unschedule('permit-expiry-sweep-15min');
EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN
  PERFORM cron.unschedule('permit-expiry-sweep-hourly');
EXCEPTION WHEN OTHERS THEN NULL; END $$;
SELECT cron.schedule(
  'permit-expiry-sweep-hourly',
  '0 * * * *',
  $cron$
  SELECT net.http_post(
    url:='https://jdvsvqiyptijplyhmqqn.supabase.co/functions/v1/permit-expiry-sweep',
    headers:='{"Content-Type": "application/json", "apikey": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpkdnN2cWl5cHRpanBseWhtcXFuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYyMjA0MjQsImV4cCI6MjA4MTc5NjQyNH0.T8egtqpDIhC84CM3w_Zxwqqe9zjw5ZunYHnnQJ4eut4"}'::jsonb,
    body:=concat('{"time": "', now(), '"}')::jsonb
  ) AS request_id;
  $cron$
);

-- 5. reap-stuck-backups: every 15 min → every hour, renamed.
DO $$ BEGIN
  PERFORM cron.unschedule('reap-stuck-backups-every-15min');
EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN
  PERFORM cron.unschedule('reap-stuck-backups-hourly');
EXCEPTION WHEN OTHERS THEN NULL; END $$;
SELECT cron.schedule(
  'reap-stuck-backups-hourly',
  '0 * * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://jdvsvqiyptijplyhmqqn.supabase.co/functions/v1/reap-stuck-backups',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpkdnN2cWl5cHRpanBseWhtcXFuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYyMjA0MjQsImV4cCI6MjA4MTc5NjQyNH0.T8egtqpDIhC84CM3w_Zxwqqe9zjw5ZunYHnnQJ4eut4'
    ),
    body := jsonb_build_object('source', 'pg_cron', 'at', now())
  ) AS request_id;
  $cron$
);
