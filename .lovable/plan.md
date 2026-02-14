

# Add Email Mapping for 4 Missing Notification Types

## Summary

Four notification types generate in-app notifications but are NOT mapped in the email pipeline, so no emails are sent for them. This plan adds full email support for all four.

## Missing Event Types

| Notification Type | When It Fires | Who Gets It |
|---|---|---|
| `admin_status_step_back` | Admin moves a KPI back one workflow stage | Employee |
| `rollback_requested` | Any participant requests a rollback | Next-level reviewer |
| `rollback_approved` | Reviewer approves the rollback | Requester |
| `rollback_rejected` | Reviewer dismisses the rollback | Requester |

## Changes Required

### 1. Database Trigger -- `send_email_on_notification()`

Add 4 new CASE mappings so these notification types are forwarded to the edge function:

```text
WHEN 'admin_status_step_back' THEN mapped_event_type := 'admin_status_step_back';
WHEN 'rollback_requested'     THEN mapped_event_type := 'rollback_requested';
WHEN 'rollback_approved'      THEN mapped_event_type := 'rollback_approved';
WHEN 'rollback_rejected'      THEN mapped_event_type := 'rollback_rejected';
```

Also add `rollback_reason` to the JSON body so rollback emails can include the justification text.

### 2. Edge Function -- `send-email-notification/index.ts`

Add to `DEFAULT_TEMPLATES`:
- **admin_status_step_back**: Subject "[PMS] Admin Moved Your KPI Back", body includes KPI name and a note to check the dashboard
- **rollback_requested**: Subject "[PMS] Rollback Requested on KPI", body includes reason and prompt to review
- **rollback_approved**: Subject "[PMS] Rollback Approved", body confirms the requester can now edit/resubmit
- **rollback_rejected**: Subject "[PMS] Rollback Request Dismissed", body informs the requester

Add to `EVENT_STYLES`:
- `admin_status_step_back`: orange/warning style
- `rollback_requested`: amber style
- `rollback_approved`: green/success style
- `rollback_rejected`: gray/neutral style

### 3. Email Settings Hook -- `useEmailNotificationSettings.ts`

Add the 4 new types to the `EmailEventType` union type.

### 4. Admin UI -- `EmailNotificationSettings.tsx`

Add 4 new entries to the `EMAIL_EVENTS` array so admins can toggle these events on/off:
- "Admin Status Step Back" -- Notify employee when admin moves KPI back
- "Rollback Requested" -- Notify reviewer when a rollback is requested
- "Rollback Approved" -- Notify requester when rollback is approved
- "Rollback Dismissed" -- Notify requester when rollback is dismissed

### 5. Documentation -- `DOCUMENTATION.md`

Update the email event mapping section to list 27 total event types (up from 23).

## Files Modified

| File | Change |
|---|---|
| New SQL migration | Add 4 CASE mappings + `rollback_reason` to `send_email_on_notification()` |
| `supabase/functions/send-email-notification/index.ts` | Add 4 templates + 4 event styles |
| `src/hooks/useEmailNotificationSettings.ts` | Add 4 types to `EmailEventType` union |
| `src/components/admin/EmailNotificationSettings.tsx` | Add 4 toggle entries to `EMAIL_EVENTS` |
| `DOCUMENTATION.md` | Update event count and list |

## Risk

Very Low -- additive changes only. Existing email mappings are untouched. New events default to "off" until an admin enables them.

