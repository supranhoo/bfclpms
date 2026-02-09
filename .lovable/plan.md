
# Email Notification Audit: Gap Analysis and Recommendations

## Current Architecture

The system uses a **database trigger** (`trigger_send_email_on_notification`) that fires on every INSERT into the `notifications` table. This trigger calls the `send-email-notification` edge function via `pg_net`, passing the notification's `type` as the `event_type`.

## Critical Issue: Notification Type Mismatch

The **biggest problem** is that the notification types used in the database triggers **do not match** the email template event types. The email system will silently skip these notifications because the event types are not in the enabled events list.

### Notification types inserted by DB triggers vs. Email template types:

```text
DB Trigger Type              Email Template Type     Status
--------------------------   ---------------------   --------
kpi_submitted                kpi_submitted           MATCH
kpi_approved                 manager_approved        MISMATCH
kpi_ready_for_audit          (none)                  NO TEMPLATE
kpi_ready_for_management     (none)                  NO TEMPLATE
kpi_finalized                final_approved           MISMATCH
query_raised                 query_raised             MATCH
query_resolved               query_resolved           MATCH
query_response_received      (none)                  NO TEMPLATE
admin_status_change          (none)                  NO TEMPLATE
admin_data_entry             (none)                  NO TEMPLATE
admin_data_override          (none)                  NO TEMPLATE
org_kpi_sent_back            (none)                  NO TEMPLATE
```

### Email templates defined but NEVER triggered (no matching notification inserts):

```text
Email Template Type          Status
--------------------------   --------------------------
manager_approved             Never triggered (DB uses 'kpi_approved')
manager_rejected             Never triggered (no notification insert)
kra_assigned                 Never triggered (no notification insert)
period_locked                Never triggered (no notification insert)
pip_initiated                Never triggered (no notification insert)
pip_milestone_reminder       Never triggered (no notification insert)
pip_completed                Never triggered (no notification insert)
```

## Plan: Fix All Gaps

### Step 1: Fix Type Mismatches in DB Trigger

Update the `send_email_on_notification()` trigger function to **map** the internal notification types to the email template event types. This avoids breaking in-app notification display while ensuring emails use the correct templates.

Add a type mapping inside the trigger:
- `kpi_approved` (with metadata stage=manager) maps to `manager_approved`
- `kpi_approved` (with metadata stage=auditor) maps to `audit_approved` (new template needed, or reuse `manager_approved`)
- `kpi_finalized` maps to `final_approved`
- `kpi_ready_for_audit` maps to `manager_approved` (as FYI to auditors)
- `kpi_ready_for_management` maps to a new or existing template

### Step 2: Add Missing Notification Triggers

Create new database triggers/inserts for events that currently have email templates but no notification sources:

1. **manager_rejected / Send Back**: Add a notification INSERT in the KPI status trigger when status goes from `self_review`/`manager_check` back to `kra_set` (send-back flow).
2. **kra_assigned**: Add a notification INSERT when KPIs are created (admin import or manual creation).
3. **period_locked**: Add a notification INSERT in the review period lock logic.
4. **pip_initiated**: Add a notification INSERT in `usePIP.ts` when a PIP is created.
5. **pip_milestone_reminder**: This requires a scheduled/cron job to check upcoming milestones. Add a database function or edge function that runs periodically.
6. **pip_completed**: Add a notification INSERT in `usePIP.ts` when PIP status changes to completed.

### Step 3: Add Missing Email Templates

Add email templates for notification types that exist but have no email template:

1. **kpi_ready_for_audit**: "A KPI is ready for your audit review"
2. **kpi_ready_for_management**: "A KPI is ready for management review"
3. **query_response_received**: "Employee has responded to your query"
4. **admin_status_change**: "Admin has changed your KPI status"
5. **org_kpi_sent_back**: "Org KPI data sent back for revision"

### Step 4: Update Edge Function

Add the new event types to `DEFAULT_TEMPLATES` and `EVENT_STYLES` in `send-email-notification/index.ts`.

### Step 5: Update Frontend Event Toggles

Add the new event types to:
- `EmailEventType` in `useEmailNotificationSettings.ts`
- Event toggle list in `EmailNotificationSettings.tsx`
- Template editor in `EmailTemplateEditor.tsx`

### Step 6: Update DOCUMENTATION.md

Sync documentation with all changes.

## Summary of Changes

| File | Change |
|------|--------|
| New migration SQL | Fix type mapping in trigger, add notification inserts for send-back, KRA assignment, period lock, PIP events |
| `supabase/functions/send-email-notification/index.ts` | Add new templates + event styles for all missing types |
| `src/hooks/useEmailNotificationSettings.ts` | Add new `EmailEventType` values |
| `src/components/admin/EmailNotificationSettings.tsx` | Add new event toggles |
| `src/components/admin/EmailTemplateEditor.tsx` | Add new template entries |
| `src/hooks/usePIP.ts` | Add notification inserts for PIP lifecycle events |
| `DOCUMENTATION.md` | Update with complete notification mapping |

## Technical Considerations

- The trigger function uses `pg_net` for async HTTP calls -- this architecture remains unchanged
- Type mapping is done in the trigger to keep backward compatibility with in-app notification display
- PIP milestone reminders require either a cron-triggered edge function or a database scheduled job (recommend a pg_cron approach or manual "check milestones" button for now)
- All new notification types will respect the existing enabled/disabled toggle per event type
