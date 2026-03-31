

## Plan: Fix "Send Reminder" Error — Enable `org_kpi_pending_reminder` Event

### Root Cause

The edge function works correctly. It returns HTTP 400 with `"Pending KPI reminder event is not enabled"` because the `org_kpi_pending_reminder` event type is not present in the `email_notification_events` list stored in `system_settings`.

This is NOT a code bug — it's a configuration issue. However, there are two problems to address:

1. **The `org_kpi_pending_reminder` toggle may be missing from the Email Notification Settings UI** — so the admin has no way to enable it
2. **The error message shown to the user is unhelpful** — it says "Edge Function returned a non-2xx status code" instead of the actual reason ("Pending KPI reminder event is not enabled")

### Fix

**`src/pages/admin/OrgKpiDataEntry.tsx`** (error handling improvement):
- When `supabase.functions.invoke` returns, the `error` object from the SDK is a generic "non-2xx" message. The actual error is in `data?.error`. Currently the code checks `data?.error` after `if (error) throw error` — but the SDK sets `error` for any non-2xx, so `data` is never reached.
- Fix: parse the response properly — check `data?.error` first since the function returns JSON even on 400 status codes. Use `error?.message` only as fallback.

**`src/components/admin/EmailNotificationSettings.tsx`** (if toggle is missing):
- Verify `org_kpi_pending_reminder` exists in the available events list. If missing, add it so admins can enable it from Settings > Email Notifications.

### Files Modified

| File | Change |
|------|--------|
| `src/pages/admin/OrgKpiDataEntry.tsx` | Fix error handling to show actual error message from function response |
| `src/components/admin/EmailNotificationSettings.tsx` | Ensure `org_kpi_pending_reminder` toggle exists |
| `DOCUMENTATION.md` | v2.15.21 |

### Risk Assessment
- **Regression**: Zero — error handling improvement only
- **Data**: No schema changes

