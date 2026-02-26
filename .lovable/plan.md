

# Audit KPI-Level Assignment + Assigned Auditor Badge (v1.46.20)

## Problem

The current audit assignment system assigns **entire employees** to auditors. Shekhar wants finer control: assign **specific KPIs** of an employee (e.g., some of Abhas's KPIs to Mayank, others to Ayush). Additionally, when viewing an employee's KPI details in the Audit view, each KPI should show who it's assigned to -- displayed as a small badge next to the status badge (e.g., "KRA Set" + "Mayank").

## Solution

1. **Extend the database** -- add a new table `audit_kpi_level_assignments` that maps `auditor_id` to `kpi_id` (not employee_id).
2. **New hook** -- `useAuditKpiAssignments` for CRUD on KPI-level assignments.
3. **New assignment UI** -- inside the AuditScorecard (the "View KPI Details" tab), add an inline way for the lead auditor to assign individual KPIs to team members.
4. **Auditor badge on KPI rows** -- in `KpiDetailsTable`, when `viewType === 'audit'`, show the assigned auditor's name next to the status badge.

The existing employee-level assignment system remains unchanged -- it continues to work for grouping employees in the grid. This new feature adds a second, more granular layer.

## Visual Result

```text
KPI Details Table (Audit View for Abhas):
+----------+------------------+--------+------+--------+--------------------------+----------+
| Category | KRA / KPI        | Target | Wt.  | Scores | Status                   | Actions  |
+----------+------------------+--------+------+--------+--------------------------+----------+
| Finance  | Revenue Growth   | 100    | 15%  | ...    | [KRA Set] [-> Mayank]    | [View]   |
| Finance  | Cost Reduction   | 50     | 10%  | ...    | [Self Review] [-> Ayush] | [View]   |
| Quality  | Defect Rate      | 5      | 20%  | ...    | [KRA Set]                | [Assign] |
+----------+------------------+--------+------+--------+--------------------------+----------+
```

## Database Changes

### New Table: `audit_kpi_level_assignments`

| Column | Type | Description |
|--------|------|-------------|
| id | uuid (PK) | Auto-generated |
| kpi_id | uuid (FK kpis) | The specific KPI being assigned |
| auditor_id | uuid (FK profiles) | The auditor receiving the assignment |
| assigned_by | uuid | Who made the assignment |
| created_at | timestamptz | Auto timestamp |

- Unique constraint on `(kpi_id, auditor_id)` to prevent duplicates.
- RLS: Auditors and admins can SELECT, INSERT, UPDATE, DELETE.

## Code Changes

### 1. New Hook: `src/hooks/useAuditKpiAssignments.ts`

- `useAuditKpiAssignments(kpiIds: string[])` -- fetch assignments for a list of KPIs, returns a `Map<kpi_id, { auditor_id, auditor_name }>`.
- `useAssignKpiToAuditor()` -- mutation to assign a KPI to an auditor.
- `useRemoveKpiAuditAssignment()` -- mutation to remove assignment.
- Joins with `profiles` to get auditor name.

### 2. Update: `src/components/review/KpiDetailsTable.tsx`

- Add optional prop `auditKpiAssignments?: Map<string, { auditor_id: string; auditor_name: string }>`.
- In the **Status** column (line 433-446), after the status badge, render the assigned auditor name as a small badge when the map has an entry for that KPI:

```tsx
{auditAssignment && (
  <Badge variant="outline" className="bg-indigo-50 text-indigo-700 text-xs ml-1">
    -> {auditAssignment.auditor_name}
  </Badge>
)}
```

- Add optional prop `onAssignAuditor?: (kpi: KPI) => void` for an "Assign" button in the actions column (only in audit view, for unassigned KPIs).

### 3. Update: `src/components/review/AuditScorecard.tsx`

- Import `useAuditKpiAssignments` and the auditor list query.
- Fetch KPI-level assignments for the current employee's KPIs.
- Pass `auditKpiAssignments` map to `KpiDetailsTable`.
- Add a small popover/dialog for assigning a KPI to an auditor (select from list of auditors with the `auditor` role).
- Pass `onAssignAuditor` callback to `KpiDetailsTable`.

### 4. New Component: `src/components/review/AuditKpiAssignPopover.tsx`

- A small popover triggered from the KPI row.
- Shows a list of auditors (from user_roles where role = 'auditor').
- Click an auditor to assign, or "Remove" to unassign.
- Compact UI -- fits inline in the table.

## What Does NOT Change

- The existing `audit_kpi_assignments` table (employee-level) remains untouched.
- The EmployeeSelectorGrid grouping ("My Assignments" / "All Others") continues to work.
- Other view levels (team, HR PMS, management) are unaffected.
- The actual audit review workflow (scoring, forwarding, send-back) is unchanged.

## Risk Assessment

| Aspect | Risk | Mitigation |
|--------|------|-----------|
| Data impact | Low | New table only; no existing tables modified |
| Workflow impact | None | Assignments are informational badges, not access restrictions |
| Regression | None | KpiDetailsTable change is additive (optional prop); other views don't pass it |
| Scalability | Good | Per-KPI granularity; can assign any number of KPIs to any auditor |

