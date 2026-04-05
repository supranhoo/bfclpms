

## Per-Template Email Schedule & Auto-Trigger

### What This Does
Adds a **Schedule** button (clock icon) next to Preview on each email template tab. Admins can choose per template whether the email should:
- **Send Immediately** (default, current behavior) — fires on event
- **Send at Scheduled Time** — batches and sends at a fixed daily time (e.g., 9:00 AM)

Scheduled templates accumulate notifications in `notifications` table as usual, but the actual email dispatch is deferred. A single cron-triggered edge function processes all scheduled templates at their configured times.

### Architecture

```text
Admin sets schedule per template (system_settings)
  → event occurs → notification created → email NOT sent immediately
  → pg_cron (every 15 min) → send-scheduled-emails (Edge Function)
    → reads schedule config from system_settings
    → checks if current time matches any template's scheduled time
    → fetches unsent notifications for those templates
    → sends batched emails via send-email-notification
```

### Implementation Plan

#### 1. Database: Store Schedule Config per Template
Use `system_settings` with key pattern `email_schedule_{template_key}`:
```json
{
  "mode": "immediate" | "scheduled",
  "time": "09:00",
  "timezone": "Asia/Kolkata"
}
```
No migration needed — reuses existing `system_settings` table.

#### 2. New DB Table: `email_dispatch_queue`
A lightweight queue to hold pending emails when a template is in "scheduled" mode. When an event fires and the template is set to "scheduled", instead of calling `send-email-notification`, the system inserts a row into this queue. The cron job processes the queue at scheduled times.

Columns: `id`, `template_key`, `recipient_email`, `recipient_name`, `metadata` (jsonb), `created_at`, `sent_at` (nullable).

#### 3. UI: Schedule Popover per Template
In `EmailTemplateEditor.tsx`, add a **Schedule** button (Clock icon) between the template header and Preview/Reset buttons. Clicking opens a popover with:
- Radio: Immediate / Scheduled
- Time picker (HH:MM, 24h format) — shown when "Scheduled" selected
- Save Schedule button

#### 4. Hook: `useEmailTemplateSchedules`
- Fetches all `email_schedule_*` from `system_settings`
- Provides `getSchedule(templateKey)` and `updateSchedule(templateKey, config)` 
- Caches via react-query

#### 5. Edge Function: `send-scheduled-emails`
- Triggered by pg_cron every 15 minutes
- Reads all `email_schedule_*` settings
- For each template in "scheduled" mode, checks if current time (in configured timezone) matches the scheduled window
- Fetches pending rows from `email_dispatch_queue` for matching templates
- Sends via `send-email-notification`
- Marks rows as sent

#### 6. Modify Email Dispatch Logic
In `send-email-notification` edge function and all callers (triggers, other edge functions):
- Before sending, check if the template has a schedule config
- If mode = "scheduled", insert into `email_dispatch_queue` instead of sending immediately
- If mode = "immediate" or no config, send as usual (current behavior)

This check is added in the `send-email-notification` function itself so ALL callers automatically respect the schedule without modification.

#### 7. pg_cron Job
```sql
SELECT cron.schedule(
  'process-scheduled-emails',
  '*/15 * * * *',
  $$ SELECT net.http_post(...) $$
);
```

### Files to Change

| File | Change |
|------|--------|
| **DB Migration** | Create `email_dispatch_queue` table with RLS |
| `src/components/admin/EmailTemplateEditor.tsx` | Add Schedule button + popover UI per template |
| `src/hooks/useEmailTemplateSchedules.ts` | **New** — hook to read/write schedule configs from system_settings |
| `supabase/functions/send-email-notification/index.ts` | Add queue-or-send check: if template is scheduled, insert to queue instead |
| `supabase/functions/send-scheduled-emails/index.ts` | **New** — processes queued emails at scheduled times |
| `supabase/config.toml` | Add `[functions.send-scheduled-emails]` |
| `POLICY.md` | Add policy §65 for email scheduling |
| `DOCUMENTATION.md` | Version bump |

### Risk Assessment
- **Data Impact**: New table `email_dispatch_queue` — no effect on existing data. Schedule configs stored in existing `system_settings`.
- **Workflow Impact**: Default is "immediate" for all templates — zero change to current behavior until admin explicitly schedules a template.
- **Regression Risk**: Low. The check is added inside `send-email-notification` as a gatekeeper, so all existing callers work unchanged.
- **Mitigation**: Queue rows have `created_at` timestamps; stale items older than 24h are auto-skipped to prevent floods after downtime.

