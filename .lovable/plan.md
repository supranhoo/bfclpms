

## Daily Email Reminders for Unresponded Queries & Observations

### What This Does
A new automated daily job that sends email reminders to employees who have open (unresponded) queries or observations. Reminders continue daily until the employee responds. Two new email event types are added so admins can toggle these reminders independently.

### Architecture

```text
pg_cron (daily at 9 AM) 
  → net.http_post → send-query-observation-reminders (Edge Function)
    → Finds open queries where raised_to has NOT responded
    → Finds open observations where tagged employee has NOT acknowledged
    → Groups by recipient
    → Calls send-email-notification for each recipient
```

### Implementation Plan

#### 1. New Edge Function: `send-query-observation-reminders`

- Triggered daily via pg_cron
- Queries `kpi_queries` where `status = 'open'` (not responded) — groups by `raised_to`
- Queries `kpi_observations` where `status = 'open'` (not acknowledged) — groups by `employee_id` (the tagged employee)
- For each recipient, builds a consolidated email listing all their pending queries and observations
- Calls `send-email-notification` with new event types `query_response_reminder` and `observation_response_reminder`
- Respects `email_notifications_enabled` and per-event toggles

#### 2. New Email Templates in `send-email-notification`

Two new event types added to the templates and banner config:
- **`query_response_reminder`**: "You have X open queries pending your response" with a table of KPI names, query raisers, and dates
- **`observation_response_reminder`**: "You have X open observations pending acknowledgment" with details

#### 3. Email Settings Update

- Add `query_response_reminder` and `observation_response_reminder` to `EmailEventType` in `useEmailNotificationSettings.ts`
- Add corresponding labels in the Email Settings UI so admins can enable/disable these reminders

#### 4. pg_cron Job

Schedule the edge function to run daily at 9:00 AM IST:
```sql
SELECT cron.schedule(
  'daily-query-observation-reminder',
  '30 3 * * *',  -- 3:30 UTC = 9:00 AM IST
  $$ SELECT net.http_post(...) $$
);
```

#### 5. Admin Toggle (Optional Enhancement)

Add a system setting `reminder_frequency_days` (default: 1) so admins can adjust frequency if needed in the future.

### Files to Change

| File | Change |
|------|--------|
| `supabase/functions/send-query-observation-reminders/index.ts` | **New** — Edge function that finds open queries/observations and sends reminder emails |
| `supabase/functions/send-email-notification/index.ts` | Add `query_response_reminder` and `observation_response_reminder` templates and banner configs |
| `supabase/config.toml` | Add `[functions.send-query-observation-reminders]` with `verify_jwt = false` |
| `src/hooks/useEmailNotificationSettings.ts` | Add two new event types |
| Email Settings UI component | Add labels for the two new reminder events |
| DB (via insert tool) | pg_cron job to invoke the function daily |
| `POLICY.md` | Add policy for daily query/observation reminders |
| `DOCUMENTATION.md` | Version bump |

### Risk Assessment
- **No schema changes**: Only reads existing `kpi_queries` and `kpi_observations` tables
- **No regression**: Additive — new edge function and email templates, no existing logic modified
- **Admin control**: Reminders only sent if the corresponding event type is enabled in email settings
- **Dedup safety**: Only sends for items still in `open` status; once employee responds, reminders stop automatically

