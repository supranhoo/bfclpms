## 1. Assumptions
- You want the Bulk Review matrix to work at normal 100% browser zoom.
- “All KRA” means every KRA/KPI row matching the active filters should remain visible in the matrix, not disappear because only a 20-employee window is selected.
- You prefer horizontal scrolling across employee columns, while the left `KPI / KRA` column stays frozen.
- No database/RPC change is required because `useBulkReviewSnapshotAll` already accumulates the loaded scope pages.

## 2. Clarifications
Not Applicable — the desired behavior is clear from your screenshots and explanation.

## 3. Risk & Impact Report
- **Data Impact:** No schema, RLS, historical data, scoring, workflow, or audit data changes.
- **Workflow Impact:** No reviewer permissions or approval workflow changes.
- **UI/UX Impact:** Matrix interaction changes from employee-window paging to true horizontal employee scrolling. The left KPI/KRA column remains sticky while employee names/cells scroll right.
- **Regression Risk:** Medium UI risk because wide matrices can become heavy if all employees render at once.
- **Scalability Impact:** Existing 25k-cell scope cap remains the safety guard. Column widths will be fixed and compact so 100% zoom remains usable. If later scopes exceed this comfortably, row/column virtualization should be added, but this request can be solved without changing backend logic.
- **Mitigation Plan:** Keep the existing click-to-load + 25k cap, avoid extra queries, use fixed column widths, preserve sticky headers, and add a source-level regression test around the removed employee windowing behavior.

## 4. Step-by-step Plan
1. **Remove employee windowing from Bulk Review dashboard**
   - Stop slicing employees into 20-column windows.
   - Remove `EmployeeWindowPager` rendering from `BulkReviewDashboard.tsx`.
   - Pass the full filtered row set (`loadedRows`) into `BulkReviewMatrixGrid`.

2. **Make the matrix horizontally scrollable at 100% zoom**
   - In `BulkReviewMatrixGrid.tsx`, keep the matrix inside an `overflow-auto` container.
   - Give the table an explicit minimum width based on: frozen KPI/KRA column + employee column count × fixed employee column width.
   - Keep the header row sticky at the top.
   - Keep the first `KPI / KRA` column sticky on the left with a higher z-index and shadow.

3. **Ensure “All KRAs” shows actual filtered data**
   - Build KRA/KPI rows from the full filtered dataset, not a visible employee slice.
   - Keep Category/KRA/Search/Department/Company filters exactly as-is.
   - Preserve client-side KRA filtering after the accumulated snapshot is loaded.

4. **Improve usability for wide employee lists**
   - Use compact, stable employee column widths.
   - Keep employee header names readable with controlled wrapping/truncation.
   - Keep the matrix height bounded so vertical and horizontal scrollbars are available inside the matrix surface.

5. **Update documentation/memory**
   - Update `DOCUMENTATION.md` Version History with this UI behavior change.
   - Update `mem/features/review/bulk-review-dashboard` to replace the prior 20-employee windowing note with horizontal-scroll/frozen-column behavior.
   - If `CHANGELOG_2026.md` exists, append the current-week note per project preference.

## 5. UI Changes
- **Location:** `/review/bulk-scoring`, loaded Bulk Review matrix.
- **Visual change:** The employee pager row (`Employees 1–20 of N`, Prev/Next/Jump) will be removed.
- **Interaction change:** Users scroll horizontally to the right to see all mapped employees.
- **Frozen column:** The left `KPI / KRA` column remains visible while scrolling employee names and score cells.
- **Responsiveness:** At 100% zoom, the matrix fits the viewport height and provides internal scrollbars instead of requiring browser zoom-out.

## 6. Implementation
- Modify only frontend presentation/state code:
  - `src/pages/review/BulkReviewDashboard.tsx`
  - `src/components/review/BulkReviewMatrixGrid.tsx`
- Remove unused import/state/constants related to employee windowing.
- Keep `src/components/review/EmployeeWindowPager.tsx` only if still referenced elsewhere; otherwise remove it to avoid dead code.

## 7. Tests
- Add/update a focused test that verifies Bulk Review no longer windows employees before rendering the matrix.
- Validate the source no longer renders `EmployeeWindowPager` from `BulkReviewDashboard.tsx`.
- Existing data/scoring tests remain unaffected because the scoring logic is unchanged.

## 8. DOCUMENTATION.md updates
- Add a new Version History entry documenting:
  - All filtered KRA/KPI rows render from the accumulated dataset.
  - Employee columns are horizontally scrollable.
  - `KPI / KRA` remains frozen.
  - No RPC/RLS/scoring changes.

## 9. POLICY.md updates
Not Applicable — this is a UI rendering/navigation correction only. It does not alter business rules, scoring policy, workflow, permissions, or data governance.

## 10. Post-implementation notes
- Rollback is simple: revert the two frontend edits and documentation/memory updates.
- Backup coverage is unaffected because no database tables or migrations are added.
- Used the `ui-ux-pro-max` skill for the 100% zoom, scroll behavior, sticky column, and data-density UX decisions.