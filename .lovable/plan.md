
# Feature: Admin KPI Status Step-Back Control

## Overview

Add a button in the Admin KPI Dashboard (AllKpis page) that lets an admin move any KPI's workflow status **one step backward**. This requires a mandatory reason, creates a full audit trail in `kpi_audit_logs`, and notifies the affected employee.

## What Changes

### 1. New Dialog: `AdminStatusStepBackDialog`

A new dialog component (`src/components/admin/AdminStatusStepBackDialog.tsx`) that:
- Shows the KPI name, employee name, current status, and the target (previous) status
- Requires a mandatory reason/justification (textarea)
- On submit:
  1. Updates `kpis.status` to the previous stage
  2. Inserts an `ADMIN_STATUS_STEP_BACK` entry in `kpi_audit_logs` with old status, new status, reason, and `on_behalf_of`
  3. Sends an in-app notification to the employee informing them of the change

### 2. Status Step-Back Logic

The workflow stages are: `kra_set` -> `self_review` -> `manager_check` -> `audit` -> `management_review` -> `approved`

"Step back" means moving to the **immediately previous** stage. If a KPI is already at `kra_set`, the button is disabled (no previous stage).

| Current Status | Steps Back To |
|---------------|---------------|
| `self_review` | `kra_set` |
| `manager_check` | `self_review` |
| `audit` | `manager_check` |
| `management_review` | `audit` |
| `approved` | `management_review` |
| `kra_set` | (disabled) |

### 3. Integration in AllKpis Page

In the expanded KPI row (inside the employee expansion), add a new "Step Back" button (using the `Undo2` icon) next to the existing Edit/Data Entry/Delete buttons. The button:
- Is disabled if KPI is at `kra_set` (nothing to step back to)
- Opens the `AdminStatusStepBackDialog` on click
- Has a tooltip explaining "Step Back Status"

### 4. Hook: `useAdminStatusStepBack`

A new mutation hook in `src/hooks/useAdminDataEntry.ts` that handles:
1. Updating `kpis.status` to the previous stage
2. Inserting audit log with action `ADMIN_STATUS_STEP_BACK`
3. Sending notification to the employee
4. Invalidating relevant query caches

### 5. Audit Trail Visibility

The existing Audit Trail Report (`src/pages/reports/AuditTrailReport.tsx`) already displays `kpi_audit_logs` entries. The new `ADMIN_STATUS_STEP_BACK` action will automatically appear there with the admin's rose-500 color theme (per existing admin action styling).

## Files Summary

| Action | File |
|--------|------|
| Create | `src/components/admin/AdminStatusStepBackDialog.tsx` |
| Edit | `src/hooks/useAdminDataEntry.ts` -- add `useAdminStatusStepBack` hook |
| Edit | `src/pages/admin/AllKpis.tsx` -- add Step Back button + dialog wiring |
| Edit | `DOCUMENTATION.md` |

## Technical Notes

- No database migration needed -- admins already have an `ALL` RLS policy on `kpis`, so status updates work
- The existing `log_kpi_status_transition` trigger will also fire automatically, creating a second audit entry for the status change (this is by design for completeness)
- The existing `notify_on_kpi_status_change` trigger handles the send-back notification (status to `kra_set`), but since we step back to any stage (not just `kra_set`), we also insert a manual admin-specific notification
- Employee is notified with the admin's reason so they understand why their KPI was moved back
