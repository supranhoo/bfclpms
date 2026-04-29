SELECT cron.schedule(
  'permit-expiry-sweep-15min',
  '*/15 * * * *',
  $$
  SELECT net.http_post(
    url:='https://jdvsvqiyptijplyhmqqn.supabase.co/functions/v1/permit-expiry-sweep',
    headers:='{"Content-Type": "application/json", "apikey": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpkdnN2cWl5cHRpanBseWhtcXFuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYyMjA0MjQsImV4cCI6MjA4MTc5NjQyNH0.T8egtqpDIhC84CM3w_Zxwqqe9zjw5ZunYHnnQJ4eut4"}'::jsonb,
    body:=concat('{"time": "', now(), '"}')::jsonb
  ) AS request_id;
  $$
);