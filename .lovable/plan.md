Plan: Convert the Status filter on Employee Performance Summary to multi-select

1. Scope
   - Target: the single "Status" dropdown on `/reports/employee-performance-summary` (see screenshot: currently shows "All Status", "Approved", "Management Review", "Audit", etc.).
   - Change only the filter control and its local state; no schema, API, or export changes.

2. What changes visually
   - Replace the single shadcn `<Select>` with the existing generic `<MultiSelectId>` component.
   - Users can select any combination of statuses: Approved, Management Review, Audit, HR PMS Review, Skip-Level Check, Manager Check, Self Review, KRA Set.
   - Default remains "All Status" (empty selection = no filtering).
   - Trigger shows the selected label when one item is selected, or "N selected" when multiple.
   - Dropdown is searchable and includes Select All / Deselect All shortcuts.
   - Keep the current ~180px width and filter-bar alignment.

3. Code changes
   File: `src/pages/reports/EmployeePerformanceSummary.tsx`
   - Import `MultiSelectId` from `@/components/ui/multi-select-id`.
   - Change state `selectedStatus` from `string` to `string[]` and default to `[]`.
   - Update `filteredData` predicate: include the row if `selectedStatus` is empty OR the row has at least one KPI whose status is in `selectedStatus`.
   - Update the `useEffect` that resets `currentPage` to depend on `selectedStatus` (array reference stable via state setter).
   - Replace the `<Select value={selectedStatus} …>` block with `<MultiSelectId options={STATUS_LABELS entries} value={selectedStatus} onChange={setSelectedStatus} placeholder="All Status" className="w-[180px]" />`.
   - Remove the now-unused `Select*` imports if they are no longer used elsewhere on the page.

4. Logic details
   - Current: `selectedStatus` is a single key; filter keeps rows with `statusCounts[selectedStatus] > 0`.
   - New: `selectedStatus` is an array of keys; filter keeps rows when `selectedStatus.length === 0` OR `selectedStatus.some(s => row.statusCounts[s] > 0)`.
   - This preserves the existing behavior for single selections and extends it naturally to multiple selections.

5. Tests
   - Create `src/test/employeePerformanceSummaryStatusFilter.test.ts`.
   - Cover:
     - Empty selection includes all rows.
     - Single selection keeps only rows with that status.
     - Multiple selection keeps rows with any of the selected statuses.
     - Selection excludes rows that have none of the selected statuses.
   - Use a small helper that mirrors the inline filter predicate so tests remain lightweight.

6. Risk & impact
   - Data impact: none.
   - Workflow impact: none; users can still choose one status exactly as before.
   - UI/UX impact: only the status dropdown control changes; table, pagination, summary cards, and export continue to work from `filteredData`.
   - Regression risk: very low; if the component is wired correctly, filtering behavior is a strict superset of the old behavior.
   - Mitigation: unit tests for the new predicate; manual smoke-test of the dropdown and table counts.

7. Rollback
   - Revert the single file change and the new test file; the original single-select code is removed in-place, so rolling back restores the previous behavior.

8. Documentation / policy
   - Not Applicable: this is a UI-only enhancement with no business-policy or schema change.