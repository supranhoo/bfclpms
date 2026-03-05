

# Fix: Management Dashboard Data Accuracy

## Root Cause Analysis

Two distinct bugs are causing incorrect data:

### Bug 1: `.in()` with 454 UUIDs overflows
When no filters are active, `filteredEmployeeIds` contains ALL 454 employee UUIDs. Line 152 passes them to `.in('employee_id', filteredEmployeeIds)`, which generates a URL that exceeds practical limits and silently returns empty/partial results. This is why January shows "0" even though the database has 1,345 KPIs for 81 employees in January 2026.

**DB verification**: `SELECT count(*) FROM kpis WHERE review_year=2026 AND review_period='January'` returns **1,345 KPIs across 81 employees**.

### Bug 2: Denominator ignores active filters
`totalEmployees` uses `profiles.length` (always 454) instead of `filteredEmployeeIds.length`. When a manager like Gaurav is selected, the denominator should reflect only his reportees.

## Fix Plan

### `src/pages/ManagementDashboard.tsx`

**Fix 1 — Skip `.in()` when no filters are active** (line 152):
- Change the condition: only apply `.in('employee_id', filteredEmployeeIds)` when at least one hierarchy filter is active (i.e., `filteredEmployeeIds.length < totalProfileCount`). When no filters are set, omit the `.in()` clause entirely so the query fetches all KPIs for the year/period without a massive UUID list.
- Detect "no filters active" by checking if any filter in the filter state is non-null.

**Fix 2 — Use filtered denominator** (line 342):
- Replace `totalEmployees: profiles.length` with `totalEmployees: hasActiveFilters ? filteredEmployeeIds.length : profiles.length`
- This ensures "5 / 15" when Gaurav is selected, not "5 / 454"

**Fix 3 — Update PDF export** to match.

### Files
1. `src/pages/ManagementDashboard.tsx`

