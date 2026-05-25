## Issue

Screenshot shows "KPI focus: Cost Centre Verification" with **1 KPI · 4 employees · 269 cells** visible, but ticking the KPI row checkbox selects **267 cells** — every row in the full loaded snapshot that matches the focused KPI, including employees not currently visible in the focused/filtered view.

## Root Cause

In `src/components/review/BulkReviewMatrixGrid.tsx` (line 361):

```tsx
const rowSubIds = submissionIdsForKpiRow(rows, kpi.key);
```

`rows` is the **unfiltered** snapshot passed into the grid. The component already builds a focus-narrowed `sourceRows` (line 160–162) used to derive the visible `kpiRows`, `employees`, and `cellMap`, but the row-toggle helper still walks the original `rows` prop. Result: the checkbox toggles every employee in the loaded scope that has that KPI, not just the 4 employees actually rendered.

This violates the principle of least surprise — the row checkbox visually sits next to a band of 4 cells, so it must operate on those 4 cells only.

## Risk & Impact Report

| Area | Impact |
|------|--------|
| Data | None — selection state only; no DB writes. |
| Workflow | Reviewers no longer accidentally sign off cells that are not on screen. |
| UI/UX | Checkbox indeterminate/checked states will reconcile with what the user sees. |
| Regression risk | Low — change is confined to `rowSubIds` derivation. Existing `bulkRowSelection.test.ts` still passes (helper unchanged). |
| Scalability | None. |

## Plan

1. **`src/components/review/BulkReviewMatrixGrid.tsx`** — derive `rowSubIds` from the **visible** rows the grid actually renders, not the full `rows` prop. Two options; I'll use option B because it already exists:
   - (A) lift `sourceRows` out of the `useMemo`, or
   - (B) walk `employees` + `cellMap` (both already focus- and employee-filter-aware) to collect the submission ids for `kpi.key`.

   ```tsx
   const rowSubIds = useMemo(() => {
     const out: string[] = [];
     for (const emp of employees) {
       const r = cellMap.get(`${kpi.key}::${emp.id}`);
       if (r?.submission_id) out.push(r.submission_id);
     }
     return out;
   }, [employees, cellMap, kpi.key]);
   ```

   Wrap inside the per-row render (or pre-compute a `Map<kpiKey, string[]>` once per render for O(K·E) total — negligible for our scope sizes).

2. **Unit test** — add a case to `src/lib/bulkRowSelection.test.ts` (or a new sibling test on the grid behavior) pinning: given a 1-KPI focus with N visible employees out of M total in snapshot, `rowSubIds.length === N`, not M.

3. **Aria/tooltip copy** — already reads from `rowSubIds.length`, so it self-corrects to "Select row (4)" once the fix lands.

4. **SSOT updates**:
   - `POLICY.md` §111.7.a — add note: "Row-level (horizontal) selection MUST scope to currently visible rows (after focus + employee filters), never the full loaded snapshot."
   - `DOCUMENTATION.md` — append a v2.66.13.11 entry summarizing the RCA + fix + regression test.

## Out of Scope

- No change to the bulk sign-off RPC, achieved/manual override logic, or cascade resolver.
- No change to the column-header (employee) horizontal select.
- No visual restyle of the row checkbox.

## Verification

- Manual: with KPI focus active and 4 employees visible, ticking the row checkbox shows "4 selected", not 267.
- Automated: new test fails on current `main`, passes after the fix.
