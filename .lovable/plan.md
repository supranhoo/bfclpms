

## Plan: Fix Monthly Review Reminder Email Delivery

### Root Cause Summary
Three issues prevent emails from being sent:
1. `monthly_review_reminder` is missing from `email_notification_events` in system_settings
2. Cron schedule needs to fire on 1st, 3rd, 5th, 7th, 9th of each month
3. Cron job needs `X-Cron-Secret` header for authentication

### Changes

**1. Add `monthly_review_reminder` to enabled events** (data update via SQL)

Current events list does not include `monthly_review_reminder`. Will update the JSON array to append it.

```sql
UPDATE system_settings 
SET setting_value = '["password_rollout","manager_rejected","final_approved","query_raised","kra_assigned","org_kpi_sent_back","pip_initiated","pip_completed","observation_raised","kra_batch_assigned","query_response_received","email_changed","observation_reply","system_auto_scored","monthly_review_reminder"]'
WHERE setting_key = 'email_notification_events';
```

**2. Create/update cron job with correct schedule and auth header** (SQL via insert tool)

Schedule the cron job at `0 8 1,3,5,7,9 * *` (8 AM UTC on 1st, 3rd, 5th, 7th, 9th) with the `X-Cron-Secret` header, following the same pattern used by the backup cron job.

```sql
SELECT cron.schedule(
  'monthly-review-reminder',
  '0 8 1,3,5,7,9 * *',
  $$
  SELECT net.http_post(
    url := '<supabase-url>/functions/v1/send-monthly-review-reminder',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer <anon-key>","X-Cron-Secret":"<cron-secret>"}'::jsonb,
    body := '{}'::jsonb
  ) AS request_id;
  $$
);
```

**3. `DOCUMENTATION.md`** — v2.15.58 patch note

### Files Modified

| File / Target | Change |
|---|---|
| `system_settings` table | Add `monthly_review_reminder` to enabled events array |
| Cron job (pg_cron) | Create/update schedule to `0 8 1,3,5,7,9 * *` with X-Cron-Secret |
| `DOCUMENTATION.md` | v2.15.58 |

### Risk
- Low — no code changes; only data update and cron configuration
- Edge function already supports both auth methods; just needs the header present

