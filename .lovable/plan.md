

# Fix: Auto KRA Rollover Cron Job Authentication

## Problem

The cron job `auto-kra-rollover-monthly` exists and runs on the 1st of each month, but it **fails silently** because:

- It sends the **anon key** as a `Bearer` token in the `Authorization` header
- The edge function expects EITHER an `X-Cron-Secret` header OR a valid admin user JWT
- The anon key is neither -- it's not a user token, so `getUser()` fails, and there's no `X-Cron-Secret` header

Meanwhile, the `weekly-database-backup` cron works correctly because it includes the `X-Cron-Secret` header.

## Fix

**Re-create the cron job** with the correct headers (matching the backup cron pattern):

1. **Unschedule** the existing broken cron job `auto-kra-rollover-monthly`
2. **Re-create** it with proper `X-Cron-Secret` header for authentication

The new cron will include:
- `X-Cron-Secret` header (matches `CRON_SECRET` env var in the edge function)
- `Authorization: Bearer <anon_key>` (needed for the Supabase gateway)
- `triggered_by: "cron"` in the body (so the function skips the admin-only setting check)

## Technical Details

### SQL to execute (via insert tool, not migration):

```sql
-- Remove old broken cron
SELECT cron.unschedule('auto-kra-rollover-monthly');

-- Create fixed cron with X-Cron-Secret header
SELECT cron.schedule(
  'auto-kra-rollover-monthly',
  '0 0 1 * *',
  $$
  SELECT net.http_post(
    url := 'https://jdvsvqiyptijplyhmqqn.supabase.co/functions/v1/auto-rollover-kpis',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpkdnN2cWl5cHRpanBseWhtcXFuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYyMjA0MjQsImV4cCI6MjA4MTc5NjQyNH0.T8egtqpDIhC84CM3w_Zxwqqe9zjw5ZunYHnnQJ4eut4", "X-Cron-Secret": "KLFASh_YrnFmgE5"}'::jsonb,
    body := '{"triggered_by": "cron"}'::jsonb
  ) AS request_id;
  $$
);
```

### Risk Assessment

| Aspect | Risk | Mitigation |
|--------|------|------------|
| Data Impact | Low -- identical rollover logic, just fixing auth | Same edge function, same behavior |
| Regression | None -- the cron was already failing silently | Fix only changes headers |
| Security | Uses existing `CRON_SECRET` already in use by backup cron | Consistent with established pattern |

### Documentation Update

Update `POLICY.md` to note the cron schedule and authentication method for auto-rollover.
