

# Feature: Smart Notification Navigation (Deep-Link to Exact Location)

## Problem

Currently, clicking a notification in the Inbox only opens a detail sheet. The "Open in App" button navigates to a page but uses a limited mapping -- many notification types (e.g., `kra_batch_assigned`, `manager_rejected`, `admin_status_step_back`, `query_raised`, `pip_initiated`, `period_locked`, `observation_raised`) either fall through to a generic `/my-kpis` or have no useful deep-link. Users want to land on the exact relevant page when interacting with a notification.

## Solution

1. Create a centralized `getNotificationNavigationPath()` utility function
2. Expand it to cover ALL notification types in the system
3. Make clicking a notification row navigate directly (not just mark as read)
4. Keep the detail sheet accessible via the view icon button

## Notification Type to Route Mapping

| Notification Type | Target Route |
|---|---|
| `kpi_submitted` | `/team-review?kpi={kpiId}` |
| `kpi_approved` | `/my-kpis?kpi={kpiId}` |
| `kpi_finalized` | `/my-kpis?kpi={kpiId}` |
| `kpi_ready_for_audit` | `/audit?kpi={kpiId}` |
| `kpi_ready_for_management` | `/management-review?kpi={kpiId}` |
| `manager_rejected` | `/my-kpis?kpi={kpiId}` |
| `admin_status_step_back` | `/my-kpis?kpi={kpiId}` |
| `admin_status_change` | `/my-kpis?kpi={kpiId}` |
| `admin_data_entry` | `/my-kpis?kpi={kpiId}` |
| `kra_batch_assigned` | `/my-kpis` |
| `query_raised` | `/queries` (received tab) |
| `query_resolved` | `/queries` (sent tab) |
| `query_responded` / `query_response_submitted` | `/queries` (sent tab) |
| `query_resolved_fyi` | `/queries` (team tab) |
| `observation_raised` / `observation_reply` | `/my-kpis?kpi={kpiId}` |
| `period_locked` | `/my-kpis` |
| `pip_initiated` / `pip_completed` / `pip_milestone_reminder` | `/admin/pip` |
| `password_rollout` | `/` (home) |

## Changes

### 1. New utility: `getNotificationNavigationPath()` in `src/lib/inboxUtils.ts`

A single function that accepts an `InboxItem` and returns the target route string. This replaces the inline `getNavigationPath()` in `InboxDetailSheet`.

### 2. Update `InboxDetailSheet.tsx`

Replace the inline `getNavigationPath()` with a call to the new shared utility.

### 3. Update `InboxRowItem.tsx`

When a notification row is clicked:
- Mark it as read (existing behavior)
- Navigate to the target route using the new utility
- For query-type items, continue opening the detail sheet (since queries have inline actions)

### 4. Update `QueryInbox.tsx`

Pass `navigate` handler to `InboxRowItem` via a new `onNavigate` prop on `InboxTable`.

### 5. Update `InboxTable.tsx`

Thread the `onNavigate` prop through to `InboxRowItem`.

### 6. Update `MobileInboxList.tsx`

Apply the same click-to-navigate behavior on mobile cards.

### 7. Update `DOCUMENTATION.md`

Document the notification-to-route mapping.

## Technical Details

### Files to modify:

| Action | File |
|--------|------|
| Edit | `src/lib/inboxUtils.ts` -- add `getNotificationNavigationPath()` |
| Edit | `src/components/inbox/InboxDetailSheet.tsx` -- use shared utility |
| Edit | `src/components/inbox/InboxRowItem.tsx` -- add click-to-navigate |
| Edit | `src/components/inbox/InboxTable.tsx` -- thread `onNavigate` prop |
| Edit | `src/components/inbox/MobileInboxList.tsx` -- add click-to-navigate |
| Edit | `src/pages/QueryInbox.tsx` -- pass navigate to table components |
| Edit | `DOCUMENTATION.md` |

### Behavior:
- Notification rows: single click navigates to the target page
- Query rows: single click still opens detail sheet (queries need inline respond/accept)
- The "eye" icon button continues to open the detail sheet for all items
- If a notification has no meaningful deep-link, it opens the detail sheet as fallback

