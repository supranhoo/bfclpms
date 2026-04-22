

## Plan — Fix Crash on Org KPI Data Entry (Employee Scope, No Department)

### Root Cause

In `src/components/admin/OrgKpiScopedEntryTable.tsx` (lines 100–112), the `groupedRows` builder seeds `lastDept = null` and then iterates sorted rows. When the **first** row in employee scope has no department (`row.departmentName` is `undefined`/`null`), `dept` resolves to `null`, which **equals** the initial `lastDept = null`. The branch falls into `else` and runs:

```ts
groupedRows[groupedRows.length - 1].rows.push(row);
//          ↑ groupedRows is still [] → index -1 → undefined → .rows throws
```

This produces the runtime error captured in the console:

> `TypeError: Cannot read properties of undefined (reading 'rows')`

The page hits the global ErrorBoundary and shows "Something went wrong". This started surfacing now because the current Org KPI you opened has at least one assigned employee whose `department_id` is null (common for non-login users / org-scope pseudo-employees).

### Fix (One File)

`src/components/admin/OrgKpiScopedEntryTable.tsx` — change the grouping loop to seed off the array's emptiness instead of a null-equality check:

```ts
const groupedRows: Array<{ dept: string | null; rows: ScopedRow[] }> = [];
if (isEmployeeScope) {
  for (const row of sortedRows) {
    const dept = row.departmentName ?? null;
    const last = groupedRows[groupedRows.length - 1];
    if (!last || last.dept !== dept) {
      groupedRows.push({ dept, rows: [row] });
    } else {
      last.rows.push(row);
    }
  }
}
```

Two improvements baked in:
1. `!last` guard guarantees we never index `[-1]`.
2. Captures `last` once, removing the duplicate `groupedRows[groupedRows.length - 1]` access.

### Risk & Impact Report

- **Data Impact**: None — pure render-side grouping logic; no DB or schema touch.
- **Workflow Impact**: None — restores the page for any KPI whose first employee row lacks a department.
- **UI/UX**: Employees without a department will continue to appear under a "No Department" group header (existing behavior at line 309 already handles `group.dept ?? 'No Department'`).
- **Regression Risk**: Very low — same grouping output for all rows that already worked, plus the previously-crashing case now renders.
- **Mitigation**: Add a unit test in `src/components/admin/__tests__/OrgKpiScopedEntryTable.test.tsx` covering: (a) first row dept = null, (b) all rows null dept, (c) mixed null + named depts. The first-null case pins the regression so it can never return.

### Files Changed

| File | Change |
|---|---|
| `src/components/admin/OrgKpiScopedEntryTable.tsx` | Replace `lastDept` flag with `last`-from-array check in grouping loop |
| `src/components/admin/__tests__/OrgKpiScopedEntryTable.test.tsx` (new) | Regression tests for null-department grouping |
| `DOCUMENTATION.md` | v2.66.7.18 — Org KPI Data Entry crash fix when first employee has no department |
| `POLICY.md` | No change required (rendering bug, not a policy shift) |

### Out of Scope

- The `rescore-backfilled-submissions` 401 is unrelated to this crash and remains as already fixed.
- No changes to data-entry behavior, propagation, or audit logs.

