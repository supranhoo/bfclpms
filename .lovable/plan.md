

# Fix: Notification Navigation ("Open in App") for All Event Types

## Problem

Two issues found with the Inbox notification navigation:

### Issue 1: Missing Navigation Mappings
The `getNotificationNavigationPath()` function in `src/lib/inboxUtils.ts` is missing mappings for 2 notification types that exist in the database:

| Type | Count in DB | Current Behavior | Expected |
|---|---|---|---|
| `kra_assigned` | 18,652 | No "Open in App" button | Navigate to `/my-kpis` |
| `observation_resolved` | 2 | No "Open in App" button | Navigate to `/my-kpis?kpi={kpiId}` |

When these notifications are clicked in the row, or when the detail sheet is opened, there is no "Open in App" button because `getNotificationNavigationPath` returns `null`.

### Issue 2: Incomplete Display Labels
The `getNotificationTypeLabel()` function only has labels for 8 types, but there are 12+ distinct types in the database. Missing labels cause raw type strings (e.g., `admin_status_step_back`) to appear in the detail sheet badge.

## What Already Works

The `admin_status_step_back` type **is already correctly mapped** (line 168-171) to `/my-kpis?kpi={kpiId}`. When an employee receives a rollback notification:
- Clicking the row navigates directly to the KPI details page
- The detail sheet shows an "Open in App" button that links to the correct KPI

So the rollback navigation is already functional. The fixes below address the remaining gaps.

## Changes

### 1. Add Missing Navigation Mappings (`src/lib/inboxUtils.ts`)

Add to the `getNotificationNavigationPath` switch statement:
- `kra_assigned` -> `/my-kpis` (same as `kra_batch_assigned`)
- `observation_resolved` -> `/my-kpis?kpi={kpiId}` (same as `observation_raised`)

### 2. Complete the Display Labels (`src/lib/inboxUtils.ts`)

Update `getNotificationTypeLabel` to include all 22 event types:
- `admin_status_step_back` -> "Status Rolled Back"
- `admin_status_change` -> "Status Changed"
- `admin_data_entry` -> "Data Updated by Admin"
- `manager_rejected` -> "Sent Back by Manager"
- `kra_assigned` -> "KRA Assigned"
- `kra_batch_assigned` -> "KRAs Assigned"
- `observation_raised` -> "Observation Raised"
- `observation_reply` -> "Observation Reply"
- `observation_resolved` -> "Observation Resolved"
- `period_locked` -> "Period Locked"
- `pip_initiated` -> "PIP Initiated"
- `pip_completed` -> "PIP Completed"
- `pip_milestone_reminder` -> "PIP Milestone Reminder"
- `password_rollout` -> "Password Reset"
- `query_response_submitted` -> "Query Response"
- `query_resolved_fyi` -> "Query Resolved"

### 3. Update DOCUMENTATION.md

Document the complete notification-to-route mapping table.

## Files to Modify
- `src/lib/inboxUtils.ts` -- Add missing navigation paths and labels
- `DOCUMENTATION.md` -- Update notification mapping docs

## Verification
After changes:
1. All notification types will show the "Open in App" button in the detail sheet
2. Clicking any notification row will navigate to the correct page
3. All notification badges will show human-readable labels instead of raw type strings

