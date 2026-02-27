
# Enhance Audit Panel with KPI-Level Assignment Visibility

## Problem

Currently the Audit Panel has two separate assignment systems that don't talk to each other on the grid screen:

1. **Employee-level assignments** (`audit_kpi_assignments`) -- Shows in "My Assignments" section on the grid. This maps entire employees to an auditor.
2. **KPI-level assignments** (`audit_kpi_level_assignments`) -- Only visible INSIDE an employee's scorecard via the `AuditKpiAssignPopover`. This assigns individual KPIs to specific auditors.

An auditor who has been assigned 5 specific KPIs across 3 employees has no way to see those on the Audit Panel grid. They must open each employee's scorecard manually to discover their KPI-level assignments.

## Solution

Merge KPI-level assignment awareness into the Audit Panel grid so auditors see a unified view of all their assignments -- both employee-level and KPI-level.

---

## Changes

### 1. New Hook: `src/hooks/useMyKpiLevelAssignments.ts`

Create a lightweight hook that fetches the current auditor's KPI-level assignments and groups them by employee:

- Queries `audit_kpi_level_assignments` where `auditor_id = current user`
- Joins with `kpis` to get `employee_id` for each assigned KPI
- Returns:
  - `assignedKpisByEmployee`: `Map<employee_id, kpi_id[]>` -- how many KPIs per employee
  - `allAssignedEmployeeIds`: `Set<employee_id>` -- all employees with at least one KPI assigned
  - `totalAssignedKpis`: number -- total count for stats

This uses the same two-step fetch pattern (no joins to profiles) established in `useAuditKpiAssignments.ts` to avoid ambiguous FK errors.

### 2. Update: `src/components/review/EmployeeSelectorGrid.tsx`

**2a. Import and fetch KPI-level assignments**

Add the new hook alongside the existing `useMyAuditAssignments`. Merge both sets to create a unified "My Assignments" employee list.

**2b. Update the "My Assignments" grouping logic**

Currently (line ~437), `assignedMembers` only checks `myAssignedEmployeeIds` (employee-level). Update to also include employees who have KPI-level assignments to the current auditor:

```
const isMyAssignment = employeeLevelAssigned.has(id) || kpiLevelAssigned.has(id);
```

**2c. Show KPI-level assignment count on employee cards**

When an employee has KPI-level assignments to the current auditor, show an additional badge on their card:

```
[3 KPIs assigned to you]
```

This appears alongside the existing pending/in-audit/forwarded badges, styled in an indigo color to match the existing KPI-assignment badge pattern used inside the scorecard.

**2d. Update stat cards**

Add a 5th stat card (or update the existing layout) to show "My KPIs" count -- the total number of KPIs specifically assigned to this auditor via KPI-level mapping. This gives instant visibility of their workload.

**2e. Update the "My Assignments" filter**

The `my_assigned` status filter currently only checks employee-level assignments. Update it to also include employees with KPI-level assignments.

### 3. Update: `src/hooks/useMyAuditAssignments.ts` (minor)

No changes needed -- this hook stays as-is for employee-level assignments. The new KPI-level hook operates independently and the merge happens in the grid component.

---

## Technical Details

### Data Flow

```text
Audit Panel Grid
  |
  +-- useMyAuditAssignments()      --> Set<employee_id>  (employee-level)
  +-- useMyKpiLevelAssignments()   --> Map<employee_id, kpi_id[]>  (KPI-level)
  |
  +-- Merge into unified "My Assignments" section
  |     - Employee-level: full card highlight
  |     - KPI-level: card highlight + "X KPIs assigned" badge
  |
  +-- "My Assignments" filter includes both types
```

### Employee Card Visual (Audit View)

```text
+--------------------------------------------------+
| [Avatar]  Abhas Luharuwalla            -->        |
|           Deputy General Manager                  |
|           Manager: Gaurav Budhia                  |
|           [============================] 15/24    |
|           [5 pending] [10 forwarded]              |
|           [3 KPIs assigned to you]   <-- NEW      |
+--------------------------------------------------+
```

The "KPIs assigned to you" badge only appears when KPI-level assignments exist for that employee-auditor pair. It uses indigo styling consistent with the existing `AuditKpiAssignPopover` badge.

### Stat Cards (Audit View) -- Updated Layout

```text
| Total Employees | Pending Audit | In Audit | Forwarded | My KPIs |
|       37        |     223       |    30    |    127    |   12    |
```

The "My KPIs" stat card shows the total count of KPI-level assignments for the current auditor. Clicking it filters to show only employees with KPI-level assignments.

---

## Risk Assessment

| Aspect | Risk | Mitigation |
|--------|------|------------|
| Data | None | Read-only query on existing `audit_kpi_level_assignments` table; no schema changes |
| Regression | Low | Existing employee-level assignment logic untouched; KPI-level is additive |
| Performance | Low | Single query for KPI-level assignments, cached by React Query |
| Security | None | RLS already restricts `audit_kpi_level_assignments` to auditor + admin roles |

## Files Summary

| File | Action | Description |
|------|--------|-------------|
| `src/hooks/useMyKpiLevelAssignments.ts` | Create | Hook to fetch current auditor's KPI-level assignments grouped by employee |
| `src/components/review/EmployeeSelectorGrid.tsx` | Edit | Merge KPI-level assignments into grid, badges, stat cards, and filters |
