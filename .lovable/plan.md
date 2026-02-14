
# Fix: Add Deep-Link Navigation for Rollback Notifications

## Problem

The "Rollback Requested" notification (and related rollback_approved / rollback_rejected types) does not navigate to the KPI when clicked. The screenshot shows the detail sheet with only a "Close" button and no way to jump to the KPI.

## Root Cause

The `getNotificationNavigationPath()` function in `src/lib/inboxUtils.ts` has no `case` entries for rollback notification types, so it falls through to `default: return null`, which means no navigation link is generated.

## Fix

**File: `src/lib/inboxUtils.ts`** (around line 225)

Add three new cases to the switch statement:

```text
case 'rollback_requested':
case 'rollback_approved':
case 'rollback_rejected':
  return item.kpiId ? `/dashboard?kpi=${item.kpiId}` : '/dashboard';
```

This will make clicking any rollback notification navigate the user directly to the KPI detail view on the dashboard.

Additionally, add human-readable labels for these types in the `getNotificationTypeLabel()` function (if not already present) so they display cleanly in the Inbox.

**File: `DOCUMENTATION.md`** -- Update the notification event mapping to include rollback types in the deep-link table.

## Files to Modify

| File | Change |
|---|---|
| `src/lib/inboxUtils.ts` | Add rollback cases to `getNotificationNavigationPath` and `getNotificationTypeLabel` |
| `DOCUMENTATION.md` | Document the new deep-link mappings |
