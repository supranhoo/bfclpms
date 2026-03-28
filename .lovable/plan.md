

## Auditor-Wise Pending KPI Breakdown on Audit Dashboard

### What You Asked For
Add a section on the Audit Panel dashboard showing how many KPIs are pending per auditor team member (e.g., Auditor001: 45, Auditor002: 78). This helps the lead auditor monitor workload distribution. No changes to Admin or HR PMS dashboards.

### Approach

**Data source**: The `audit_kpi_assignments` table maps employees to auditors, and `audit_kpi_level_assignments` maps individual KPIs to auditors. We combine both to count pending KPIs per auditor by cross-referencing with `periodKpis` status.

**UI**: Add a collapsible "Auditor Workload" summary bar below the existing stat cards on the Audit Panel. It shows each auditor's name with pending/in-audit/forwarded counts as compact badges. Clicking an auditor name filters the employee grid to show only that auditor's assigned employees.

### Implementation

#### 1. New Hook: `useAuditorWorkloadSummary.ts`
- Fetches all `audit_kpi_assignments` (employee-level) and `audit_kpi_level_assignments` (KPI-level)
- Joins with `profiles` to get auditor names
- Returns: `Map<auditor_id, { name, employee_ids[], kpi_ids[] }>`
- The actual pending/in-audit/forwarded counts are computed client-side using the already-fetched `periodKpis` in `EmployeeSelectorGrid`

#### 2. Update `EmployeeSelectorGrid.tsx`
- Import the new hook (only when `viewLevel === 'audit'`)
- Add a new `useMemo` that computes per-auditor stats: for each auditor, count their assigned KPIs that are pending/in-audit/forwarded using the same workflow logic already in the stats computation
- Render a new "Auditor Workload" row below the stat cards — a horizontal scrollable bar with compact cards per auditor showing: Name | Pending | In Audit | Forwarded
- Add an `auditorFilter` state; clicking an auditor card sets it, filtering `displayMembers` to only that auditor's assigned employees
- Add "All Auditors" option to clear the filter
- Only visible on the `audit` viewLevel

#### 3. No DB changes needed
All data already exists in `audit_kpi_assignments` and `audit_kpi_level_assignments` tables.

### Files Changed
| File | Action |
|------|--------|
| `src/hooks/useAuditorWorkloadSummary.ts` | New — fetch all auditor-to-employee/KPI mappings |
| `src/components/review/EmployeeSelectorGrid.tsx` | Update — add auditor workload bar + auditor filter below stat cards |

### Risk Assessment
- **Data**: Read-only queries on existing tables. No schema changes.
- **Regression**: Zero — new section is conditionally rendered only for `audit` viewLevel. Existing stat cards and filters untouched.
- **UI**: Compact horizontal bar, consistent with existing card styling. No layout disruption.

