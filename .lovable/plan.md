

# KPI Mapping Matrix Enhancements

## 1. Excel Export -- Full Report (Not Just Current Page)

**Problem:** The `exportExcel` function uses `rows` which only contains the current page (20 rows). The hook paginates internally but doesn't expose all filtered rows.

**Fix:** The `useKpiMappingMatrix` hook will return a new `allFilteredRows` array containing all rows (pre-pagination). The `exportExcel` function will use this instead of `rows`.

### Changes in `src/hooks/useAdminReports.ts`:
- Return `allFilteredRows` alongside the paginated `rows` from the `useMemo` block
- Add it to the hook's return object

### Changes in `src/pages/admin/KpiMappingMatrix.tsx`:
- Destructure `allFilteredRows` from the hook
- Use `allFilteredRows` in `exportExcel` instead of `rows`

---

## 2. "Mapped Employees" Count Card

**Problem:** Dashboard only shows "Total Employees" and "Mapping Coverage %". User wants to see the raw count of employees who have at least one KPI mapped.

**Fix:** The hook already computes `mappedCount` internally. Expose it as a new return value.

### Changes in `src/hooks/useAdminReports.ts`:
- Return `mappedEmployees` (the count of employees with at least one mapped month)

### Changes in `src/pages/admin/KpiMappingMatrix.tsx`:
- Add a third summary card between "Total Employees" and "Mapping Coverage" showing "Mapped Employees" count with a `UserCheck` icon

---

## 3. Sort Functionality on Table

**Problem:** No sorting on columns currently.

**Fix:** Add client-side sorting state for columns: Code, Name, Grade, Designation, Department, First Mapped. Clicking a column header toggles asc/desc. Sorting is applied in the hook before pagination.

### Changes in `src/hooks/useAdminReports.ts`:
- Accept a `sort` parameter: `{ field: string; direction: 'asc' | 'desc' }`
- Apply `allRows.sort(...)` after filters and before pagination based on the sort config
- Sortable fields: `code`, `name`, `grade`, `designation`, `department`, `firstMappedMonth`

### Changes in `src/pages/admin/KpiMappingMatrix.tsx`:
- Add `sortField` and `sortDirection` state
- Pass sort config to the hook
- Make table headers clickable with sort direction arrows (using `ArrowUpDown`, `ArrowUp`, `ArrowDown` icons from lucide)
- Clicking a header toggles the sort; clicking again reverses direction

---

## 4. Version Bump

### `DOCUMENTATION.md`: Version bump to 1.45.71

---

## Technical Summary

| File | Changes |
|------|---------|
| `src/hooks/useAdminReports.ts` | Return `allFilteredRows`, `mappedEmployees`; accept and apply sort config |
| `src/pages/admin/KpiMappingMatrix.tsx` | Use `allFilteredRows` for export; add Mapped Employees card; add sortable column headers with state |
| `DOCUMENTATION.md` | Version bump |

| Risk | Assessment |
|------|-----------|
| Data Impact | None -- all client-side changes |
| Regression Risk | Low -- additive changes only |
| Performance | Negligible -- sorting a few hundred rows client-side |

