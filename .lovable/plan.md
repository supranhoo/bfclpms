

# Fix: Notification Click Opens Detail Sheet + Status Display

## Problem 1: Clicking a notification skips the detail sheet
In `InboxRowItem.tsx`, the `handleRowClick` function (lines 58-72) immediately navigates to the dashboard for notification items. The detail sheet only opens as a fallback when no navigation path exists. This means the enriched detail view (KPI name, KRA name, From user) is never shown.

## Problem 2: No status information in the notification detail sheet
The `InboxDetailSheet.tsx` only renders status badges for query items (open/responded/resolved). For notifications, there is no workflow status display, even though the notification `metadata` contains `from_status` and `to_status` fields describing the workflow transition.

---

## Fix 1: Always open detail sheet on row click

**File: `src/components/inbox/InboxRowItem.tsx`**

Change `handleRowClick` to always call `onView(item)` for both notifications and queries. Remove the direct navigation block (lines 62-69). Users will navigate via the existing "Open in App" button inside the detail sheet.

Before:
```text
handleRowClick:
  mark as read
  if notification -> navigate directly (skips detail sheet)
  fallback: onView(item)
```

After:
```text
handleRowClick:
  mark as read
  always call onView(item) -> opens detail sheet
```

## Fix 2: Add workflow status transition to notification detail sheet

**File: `src/lib/inboxUtils.ts`**

Add a new helper function `getStatusLabel()` that converts internal status codes to human-readable labels:

| Code | Label |
|---|---|
| kra_set | KRA Set |
| self_review | Self Review |
| manager_check | Manager Review |
| skip_level_check | Skip-Level Review |
| hr_pms_check | HR PMS Review |
| audit | Audit |
| management_review | Management Review |
| approved | Approved |

**File: `src/components/inbox/InboxDetailSheet.tsx`**

Add a status transition section for notification items. When `metadata.from_status` and `metadata.to_status` are present, display them as a visual transition using badges and an arrow icon:

```text
[Self Review]  -->  [Manager Review]
```

When only the notification type is available (no status transition metadata), the existing notification type badge continues to display as-is.

## Files to Modify

| File | Change |
|---|---|
| `src/components/inbox/InboxRowItem.tsx` | Remove direct navigation from `handleRowClick`; always open detail sheet |
| `src/components/inbox/InboxDetailSheet.tsx` | Add workflow status transition display for notifications using `from_status` / `to_status` from metadata |
| `src/lib/inboxUtils.ts` | Add `getStatusLabel()` helper for human-readable status labels |
| `DOCUMENTATION.md` | Document updated click behavior and status display |

## Risk

Very Low -- the "Open in App" button inside the detail sheet already handles navigation correctly with employee deep-linking. This change only alters the entry point (click row -> see details first -> then navigate) without removing any functionality.
