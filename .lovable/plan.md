

## Add Employee Code and Sort to Workflow Status Reconciliation

### Changes

**1. Database Migration — Update `reconcile_workflow_statuses` function**

Add `employee_code` to the `jsonb_build_object` output (the function already selects `p.employee_code` but doesn't include it in the result JSON). Change line 262-273 to include `'employee_code', v_kpi.employee_code`.

**2. UI — `src/components/admin/ReconcileOrphanedKpisDialog.tsx`**

- Add `employee_code` to the `ReconcileAffectedItem` interface
- In the Employee table cell (line 384), display as `"Name (CODE)"` format using the existing `formatEmployeeName` utility from `src/lib/utils.ts`
- Add a sort toggle button (using `ArrowUpDown`/`ArrowUp`/`ArrowDown` icons) next to the "Employee" table header that sorts the `filteredAffected` list alphabetically by employee name (A-Z / Z-A toggle)
- Add state: `employeeSort: 'none' | 'asc' | 'desc'`
- Apply sorting in the `filteredAffected` memo (or a derived memo) before rendering

### Files Changed
1. **DB migration** — add `employee_code` field to reconciliation output JSON
2. **`src/components/admin/ReconcileOrphanedKpisDialog.tsx`** — show employee code, add sort control

