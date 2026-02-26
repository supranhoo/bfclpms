

# Audit KPI Delegation System (v1.46.19)

## Overview

Enable the Audit Lead (e.g., Shekhar) to assign specific employees to audit team members (e.g., Mayank, Ayush). All auditors continue to see all employees and KPIs -- nothing is hidden. However, assigned employees are visually separated and highlighted in the audit view so each auditor can focus on their workload.

## How It Works

- Shekhar (Audit Lead) opens a new "Audit Assignments" management panel
- He assigns specific employees to Mayank or Ayush
- When Mayank logs into the Audit view, he sees two sections:
  - **"Assigned to Me"** (top) -- employees specifically assigned to him, highlighted
  - **"All Others"** (below) -- remaining employees, still fully accessible
- Shekhar sees everything as before (he can optionally filter by assignee)
- New team members added later can receive assignments the same way

## Visual Result

```text
Audit View for Mayank:
+------------------------------------------+
| [Filter: Assigned to Me | All]           |
+------------------------------------------+
| -- MY ASSIGNMENTS (3 employees) -------- |
| [Employee A]  [5 pending] [2 in audit]   |
| [Employee B]  [3 pending]                |
| [Employee C]  [1 in audit] [4 forwarded] |
|                                          |
| -- ALL OTHERS (47 employees) ----------- |
| [Employee D]  [2 pending]                |
| [Employee E]  [1 in audit]               |
| ...                                      |
+------------------------------------------+
```

## Database Changes

### New Table: `audit_kpi_assignments`

| Column | Type | Description |
|--------|------|-------------|
| id | uuid (PK) | Auto-generated |
| auditor_id | uuid (FK profiles) | The auditor receiving the assignment |
| employee_id | uuid (FK profiles) | The employee whose KPIs are assigned |
| assigned_by | uuid | Who made the assignment |
| created_at | timestamptz | Auto timestamp |

Unique constraint on `(auditor_id, employee_id)` to prevent duplicates.

### RLS Policies

- **SELECT**: All authenticated auditors can read assignments (needed to display grouping)
- **INSERT/UPDATE/DELETE**: Only admins and auditors (lead can manage assignments)

## Code Changes

### 1. New Hook: `src/hooks/useAuditAssignments.ts`

- `useAuditAssignments()` -- fetch all audit assignments
- `useMyAuditAssignments()` -- fetch assignments for current user
- `useAssignAuditEmployee()` -- mutation to assign employee to auditor
- `useRemoveAuditAssignment()` -- mutation to remove assignment
- Follows the same pattern as `useOrgKpiDataOwner.ts`

### 2. New Component: `src/components/admin/AuditAssignmentDialog.tsx`

- Dialog for audit lead to manage assignments
- Shows list of auditors with their assigned employees
- Search/select employees to assign to each auditor
- Remove existing assignments
- Accessible from the Audit view header (gear icon or "Manage Assignments" button)

### 3. Update: `src/components/review/EmployeeSelectorGrid.tsx`

- Import `useMyAuditAssignments` hook
- When `viewLevel === 'audit'`, fetch the current user's assignments
- Split `displayMembers` into two groups: "assigned" and "others"
- Add a new filter option: `{ value: 'my_assigned', label: 'My Assignments' }` to the audit status options
- Render a section divider between the two groups
- Add a "Manage Assignments" button in the audit header (visible to all auditors)

### 4. Update: `src/components/review/EmployeeSelectorGrid.tsx` -- Status Filter

Add to the audit status options:

```typescript
audit: [
  { value: 'all', label: 'All Employees' },
  { value: 'my_assigned', label: 'My Assignments' },  // NEW
  { value: 'pending', label: 'With Pending Audit' },
  { value: 'in_audit', label: 'In Audit' },
  { value: 'forwarded', label: 'Forwarded' },
],
```

## What Does NOT Change

- RLS policies on `kpis` table -- all auditors still see all KPIs
- The actual audit review workflow (scoring, forwarding, send-back)
- Other view levels (team, skip-level, HR PMS, management)
- The AuditScorecard component -- once an employee is clicked, the review experience is identical

## Risk Assessment

| Aspect | Risk | Mitigation |
|--------|------|-----------|
| Data impact | Low | New table only; no existing tables modified |
| Workflow impact | None | Assignments are a UI filter, not an access restriction |
| Regression | None | Other view levels untouched; audit RLS unchanged |
| Scalability | Good | Adding new auditors = just create new assignments |
| Security | None | Read-only visibility grouping; no privilege changes |

