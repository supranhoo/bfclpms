

# Email Notification Audit: Findings and Fix

## Audit Result

After tracing every notification event end-to-end (DB trigger to edge function to email_logs table to Email Logs UI), the system is **fully wired for all 29 events**. Every event type has:

1. A DB trigger mapping (or direct edge function call) that fires the email
2. A template in the edge function with subject + body
3. Logging via `logEmail()` for sent, failed, and skipped outcomes

The reason the Email Logs page appears empty is that **only 2 real notification events have ever triggered** (two KRA batch assignments on Feb 13). No other workflow actions (self-review submissions, manager approvals, queries, etc.) have occurred yet in the system with email notifications enabled, so there is nothing to log.

## One Small Gap Found

The Email Logs page is missing **4 friendly labels** for newer event types. When these events do fire, their logs will display raw strings like `admin_status_step_back` instead of "Admin Step Back".

| Missing Event Type | Should Display As |
|---|---|
| `admin_status_step_back` | Admin Step Back |
| `rollback_requested` | Rollback Requested |
| `rollback_approved` | Rollback Approved |
| `rollback_rejected` | Rollback Dismissed |

## Fix

### File: `src/pages/admin/EmailLogs.tsx`
Add the 4 missing entries to the `EVENT_LABELS` map (around line 51, before the closing brace).

### File: `DOCUMENTATION.md`
Note that all 29 email event types are fully covered with logging.

## No Other Changes Needed

- All 29 events have templates in the edge function
- The DB trigger `send_email_on_notification` correctly maps all notification types to email event types
- The `logEmail()` helper is called on every code path (sent/failed/skipped)
- Test emails and SMTP tests are also logged (fixed in previous session)
- Password rollout emails go through the same edge function and get logged
- KRA batch assignment emails are sent directly via `kraNotifications.ts` and also get logged

To see more logs, simply use the system -- submit self-reviews, approve KPIs, raise queries, etc. Each action will generate both an in-app notification and a logged email (if that event type is enabled in settings).

