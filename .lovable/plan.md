# Fix: Bulk Review filters (Designation / Grade / Reporting Manager) not affecting results

## Symptom
On `/review/bulk` (HR PMS view, Apr-2026), the filter bar shows **All Designations / All Grades / All Reporting Managers** dropdowns, but selecting values does not reduce the **27 emp / 269 KPI / 269/269 rows** count or hide employee columns.

## Risk & Impact
- Data Impact: none — pure client-side presentation filter.
- Workflow Impact: none.
- UI/UX: filters become functional; employee columns and row counts shrink as expected.
- Regression Risk: low — change confined to `BulkReviewDashboard.tsx` filter wiring; KRA / search / hide-processed filters use the same path.
- Mitigation: keep existing unit tests for `bulkEmployeeFilter` green; add one more for the new path if logic changes.

## Likely root cause (to confirm before patching)
The wiring exists (`allowedEmpSet` → `loadedRows.filter`), but one of the following breaks it:
1. **`useBulkEmployeeAttrs` returns empty** for non-admin viewers (HR PMS) because RLS on `profiles` blocks the join to `profiles!reporting_manager_id` for rows the viewer cannot directly access — making `attrsByEmp` empty, so `allowedEmployeeIds(...)` returns `∅` and selecting any value collapses to "0 rows"… BUT here the bar still says 269/269, which instead means selections are not being applied.
2. **`MultiSelectFilter` onSelect not firing** for these three filters specifically (cmdk `value` collision when option labels duplicate, e.g. several blank designations).
3. **State setters not wired** — `setDesignations` / `setGrades` / `setManagerIds` are passed but the parent `useEffect` prune (lines 339-349) immediately strips them because `attrsByEmp` is empty (point 1), giving the illusion of a no-op.

## Plan

### Step 1 — Confirm the failure mode (read-only)
- Open `/review/bulk` as HR PMS, load scope, open the Designation dropdown, click an option, watch `attrsByEmp.size`, `designations`, and `allowedEmpSet.size` via a one-shot `console.debug` already-present or via React DevTools.
- If `attrsByEmp.size === 0` → root cause is RLS on the `profiles` self-join.
- If `attrsByEmp.size > 0` but `designations` resets to `[]` immediately → the prune effect is the culprit.
- If `designations` updates but `loadedRows` doesn't shrink → the filter predicate is wrong.

### Step 2 — Fix

**If RLS / empty attrs (most likely):** switch `useBulkEmployeeAttrs` to the same SECURITY DEFINER pattern already used for `useBulkOrgKpiFlags` — add an RPC `rpc_bulk_employee_attrs(p_employee_ids uuid[])` returning `(id, designation, pms_grade, reporting_manager_id, reporting_manager_name)`, SQL-only, `SECURITY DEFINER`, `STABLE`, `search_path = public`, granted to `authenticated`. Replace the direct `profiles` select in `useBulkReview.ts` with `supabase.rpc(...)`.

**If prune effect strips values:** guard the prune `useEffect` so it does not run while `attrsByEmp.size === 0` (it already does — verify) and only prunes when the loaded option set is non-empty.

**If MultiSelect toggle is broken:** make the `CommandItem.value` deterministic (`opt.value`) and pass the value through `onSelect`'s argument.

### Step 3 — Verify
- Manual: as HR PMS, select one Designation → row count drops, employee columns shrink, KPI cards re-derive.
- Combine with Grades and Reporting Manager (AND across axes).
- Deep-link survives reload (URL state already includes `desigs/grades/mgrs`).
- Unit: extend `src/lib/bulkEmployeeFilter.test.ts` only if the predicate changes (not expected).

## Files touched (worst case)
- `src/hooks/useBulkReview.ts` — swap profile select → RPC.
- `supabase/migrations/<new>.sql` — add `rpc_bulk_employee_attrs` + GRANT.
- `src/pages/review/BulkReviewDashboard.tsx` — only if prune guard needs tightening.
- `src/components/review/MultiSelectFilter.tsx` — only if cmdk value collision is the cause.

## Out of scope
- KRA filter, KPI search, hide-processed toggle — already working.
- Sidebar / route changes.
- Any backend write paths.

## SSOT updates (after fix)
- Append to `DOCUMENTATION.md` Bulk Review section: "Employee-axis filters read profile attrs via SECURITY DEFINER RPC to bypass RLS gaps for non-admin viewers."
- No POLICY change (presentation-only).
