

# Auditor Reassignment Feature

## Overview

Add the ability to reassign employees and KPIs between auditors -- both in bulk (transfer all work from one auditor to another) and individually (move a single employee/KPI to a different auditor).

## What This Adds

### 1. Bulk Reassignment Tab (inside existing AuditAssignmentDialog)

A new "Reassign" tab added to the existing Manage Audit Assignments dialog that allows:
- Select a **source auditor** and a **target auditor**
- View all employees currently assigned to the source auditor
- Select all or specific employees to transfer
- One-click "Reassign Selected" button that moves employee-level assignments (`audit_kpi_assignments`) AND their KPI-level assignments (`audit_kpi_level_assignments`) from the source to the target auditor
- Summary confirmation before executing

### 2. Individual Reassignment (inline on employee cards)

In the "Currently Assigned" list of the AuditAssignmentDialog, each employee row will get a small "Reassign" button (arrow icon) that opens a quick dropdown to pick a different auditor -- moving just that one employee (and their KPI-level assignments) without needing to remove and re-add.

### 3. KPI-Level Reassignment (already works)

The existing `AuditKpiAssignPopover` already supports reassigning a KPI to a different auditor via upsert. No changes needed there.

---

## Technical Plan

### New Hook: `src/hooks/useAuditReassignment.ts`

A dedicated mutation hook with two functions:

- **`useReassignEmployees`**: Accepts `{ sourceAuditorId, targetAuditorId, employeeIds[] }`. In a single transaction-like flow:
  1. Updates `audit_kpi_assignments` rows: set `auditor_id = targetAuditorId` where `auditor_id = sourceAuditorId AND employee_id IN (employeeIds)`
  2. Fetches KPI IDs for those employees from `kpis` table
  3. Updates `audit_kpi_level_assignments` rows: set `auditor_id = targetAuditorId` where `auditor_id = sourceAuditorId AND kpi_id IN (kpiIds)`
  4. Invalidates all audit assignment query caches
  5. Shows toast with count of reassigned employees

- **`useReassignSingleEmployee`**: Shorthand for reassigning one employee (calls the same logic with a single-element array)

### Modified: `src/components/admin/AuditAssignmentDialog.tsx`

- Convert the dialog to use **Tabs** (Assign | Reassign)
- **Assign tab**: Current functionality (unchanged)
- **Reassign tab**: New UI with:
  - Source auditor selector
  - Target auditor selector
  - Checkbox list of the source auditor's assigned employees
  - "Select All" toggle
  - "Reassign Selected" button with confirmation count
  - Loading states during mutation

### Modified: `src/hooks/useAuditAssignments.ts`

- Add an `useUpdateAuditAssignment` mutation that updates the `auditor_id` on an existing assignment row (for individual inline reassignment)

### Files Summary

| File | Action | Description |
|------|--------|-------------|
| `src/hooks/useAuditReassignment.ts` | **New** | Bulk and single reassignment mutation hooks |
| `src/components/admin/AuditAssignmentDialog.tsx` | **Edit** | Add Tabs layout with new Reassign tab |
| `src/hooks/useAuditAssignments.ts` | **Edit** | Add inline update mutation |

### Risk Assessment

| Aspect | Risk | Mitigation |
|--------|------|------------|
| Data Impact | Low | Only updates `auditor_id` on existing rows; no data deletion |
| RLS | None | Existing auditor/admin RLS policies already allow UPDATE on both tables |
| Regression | None | Assign tab remains unchanged; Reassign is additive |
| Duplicate Prevention | Low | `audit_kpi_assignments` has a unique constraint on `(auditor_id, employee_id)` -- will handle conflicts with upsert |

