

## Add "All Employees (Cross-Check)" Filter to Audit Panel

### Problem
The Audit Panel currently only shows employees whose resolved workflow includes an `audit` stage (via `useProfilesByWorkflowStage`). Auditors need to cross-check scores of ALL employees, including those without audit in their workflow.

### Root Cause
Line 165: `audit: 'audit'` in `PANEL_REQUIRED_STAGE` → line 177: `useProfilesByWorkflowStage('audit', ...)` → line 283: `baseMembers` is set to only stage-filtered profiles. The "All Employees" status filter (line 71) shows all employees *within that already-filtered set*, not all employees organization-wide.

### Fix

Add a new status filter option `cross_check` to the audit panel that bypasses the workflow stage filter and shows ALL active employees in read-only mode.

#### Part 1: Add filter option
In `STATUS_OPTIONS_BY_LEVEL.audit` (line 70-76), add:
```
{ value: 'cross_check', label: 'All Employees (Cross-Check)' }
```

#### Part 2: Expand `baseMembers` when cross-check is active
When `statusFilter === 'cross_check'` and `viewLevel === 'audit'`, use `allProfiles` instead of `stageFilteredProfiles` for `baseMembers`. This requires:
- Modifying the `baseMembers` useMemo (line 264-287) to check for cross-check mode
- Also adjusting `allEmployeeIds` (line 222) and loading state (line 257) similarly

#### Part 3: Filter logic for cross-check
In the status-based filtering block (line 553+), when `statusFilter === 'cross_check'`, show ALL employees (no KPI-status filtering — just demographic filters apply).

#### Part 4: Read-only indicator
When an auditor opens an employee via cross-check who does NOT have audit in their workflow, the scorecard already handles this gracefully — the auditor fields won't appear since the workflow doesn't include audit. The employee's scores from other reviewers will be visible for cross-checking purposes.

### Files to Change

| File | Change |
|------|--------|
| `src/components/review/EmployeeSelectorGrid.tsx` | Add `cross_check` filter option; expand `baseMembers` to all profiles when active; bypass workflow guard in filtering |
| `POLICY.md` | Add policy for auditor cross-check visibility |
| `DOCUMENTATION.md` | Version bump |

### Risk Assessment
- **No data changes**: Read-only cross-check, no new write paths
- **No regression**: Existing audit filters unchanged; cross-check is additive
- **Security**: Uses existing `allProfiles` hook (already RLS-protected); no new data exposure

