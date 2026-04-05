

## Persist Filters & Selected Employee Across Refresh/Navigation

### Problem
When a reviewer applies filters (department, designation, grade, etc.) in any review view (Team, Audit, HR PMS, Management), selects an employee, reviews KPIs, then refreshes or navigates back — all filters reset and the selected employee is lost. This wastes reviewer time re-applying filters.

### Root Cause
- **Filters** in `EmployeeSelectorGrid.tsx` (lines 186-193) use plain `useState` — no URL or storage persistence.
- **Selected employee** in `Dashboard.tsx` (line 38) uses plain `useState` — lost on refresh.
- Only `viewMode` is synced to URL params (`?view=team`).

### Fix — Sync filters & selected employee to URL search params

#### Part 1: Persist Filters in `EmployeeSelectorGrid`

Replace plain `useState` for all 6 filter fields with URL search param sync:

| Filter | URL Param | Example |
|--------|-----------|---------|
| `searchQuery` | `q` | `?q=samir` |
| `selectedDepartment` | `dept` | `?dept=uuid` |
| `selectedDesignation` | `desig` | `?desig=Manager` |
| `selectedGrade` | `grade` | `?grade=A` |
| `selectedManager` | `mgr` | `?mgr=uuid` |
| `statusFilter` | `status` | `?status=pending` |
| `auditorFilter` | `auditor` | `?auditor=uuid` |

On mount, read from URL params. On change, update URL params with `replace: true`. The "Clear All" action removes all filter params.

#### Part 2: Persist Selected Employee in `Dashboard.tsx`

When an employee is selected, write `?employee=<id>` to URL params (already partially supported for deep-links). On mount/refresh, if `?employee=` is present along with `?view=`, fetch that employee profile and restore the selection.

Currently the deep-link code (lines 94-176) deletes the `employee` param after processing. Change this: keep the `employee` param in the URL while the employee is selected, and remove it only when the user clicks "Back" to return to the grid.

#### Part 3: Restore flow on Back/Refresh

- **Refresh**: URL has `?view=team&dept=xxx&employee=yyy` → restores view mode, filters, and selected employee.
- **Back button** (line 274-277 `onBack`): Remove only `employee` param, keep filter params → user returns to filtered grid.
- **Browser back**: URL params preserved naturally.

### Files to Change

| File | Change |
|------|--------|
| `src/components/review/EmployeeSelectorGrid.tsx` | Read/write 7 filter states from/to URL search params instead of plain useState |
| `src/pages/Dashboard.tsx` | Persist `employee` param in URL during selection; restore on refresh; keep filter params on back |
| `DOCUMENTATION.md` | Version bump |

### Technical Approach

Create a small utility hook `useUrlFilterState(paramName, defaultValue)` that wraps `useSearchParams` for individual filter values — keeps the code clean and avoids repetition across 7 filters. The hook returns `[value, setValue]` matching the `useState` API.

### Risk Assessment
- **No data changes**: Pure UI/UX improvement.
- **Backward compatible**: Existing bookmarks/deep-links without filter params work exactly as before (default to no filters).
- **No regression**: Filter logic unchanged — only the storage mechanism changes from memory to URL.

