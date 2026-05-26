## Root Cause

`isKpiRowFullyProcessed` currently iterates over **all visible employees** in the matrix. For most KPIs, only a handful of employees actually have a `kpis` row — the rest render as `—` (no cell in `cellMap`). The current rule treats "no cell" as **pending**, so almost every row stays visible even when all assignees are done. That is why the toggle appears to do nothing in the screenshot.

## Correct Semantics (aligned with Bulk Review policy)

A KPI row is "fully processed at the viewer stage" when, **for every employee who is actually assigned this KPI** (i.e. has a cell in the row):
- the viewer-stage score is non-null, OR
- the cell is marked `is_na = true`.

Employees with no cell at all are **not assignees of this KPI** and must not block hiding. If at least one assignee is still pending, the row stays visible (existing guarantee).

Edge case: if the row has **zero assignees** (cellMap empty for the row), keep it visible — that's a data anomaly, not a processed row.

## Plan

### 1. `src/lib/bulkProcessedFilter.ts`
Change the loop to skip missing cells instead of returning `false`. Track how many cells were actually examined; if zero, return `false` (keep visible). Update the JSDoc to make the "assignees only" semantics explicit.

```text
for each empId in employeeIds:
   cell = cellMap.get(key)
   if !cell        -> continue           // not assigned, ignore
   if cell.is_na   -> seen++; continue   // processed
   if score == null -> return false      // pending assignee
   seen++
return seen > 0
```

### 2. `src/lib/bulkProcessedFilter.test.ts`
- Update "no cell" case → row should now be **hidden** when the only present cell is done.
- Add new case: assignee with score + another employee with no cell → hidden.
- Add new case: assignee pending + another employee with no cell → visible.
- Keep existing N/A and "all done" cases.
- Keep empty-employee-list defensive case.

### 3. No changes needed
- `BulkReviewMatrixGrid.tsx` — already calls the helper with the full employee list; behaviour now matches user expectation automatically.
- No DB, RLS, RPC, audit, selection, or workflow logic touched. UI-only presentation filter.

### 4. Docs / Policy / Memory
- `DOCUMENTATION.md` — bump bulk-review entry (v2.66.13.20): clarify "fully processed" = all **assigned** employees done.
- `POLICY.md` §111 — one-line clarification that unassigned employees do not block the hide toggle.
- `mem://features/review/bulk-review-dashboard` — add the assignee-only rule.

## Risk & Impact

- **Data**: none — pure client-side filter.
- **Workflow**: none — selection, RPCs, audit unchanged.
- **UI/UX**: rows where every assignee is done will now correctly disappear; pending assignees still keep their row visible (no missed work).
- **Regression**: low. The previous behaviour was a no-op in practice (toggle never hid anything in real data), so flipping the rule has minimal blast radius. All 5 existing test cases re-asserted/updated.
- **Mitigation**: targeted unit tests cover assigned-only, mixed-N/A, pending-assignee, no-assignee, and empty-list scenarios.

## Out of Scope
- Persisting toggle state in URL/localStorage.
- Hiding employee columns.
- Changing what "processed" means at stages other than the current viewer stage.
