

## Filter Inactive Employees from KPI Mapping Matrix

### Problem
The KPI Mapping Matrix shows all employees including inactive ones. There's no `is_active` filter in the profiles query or row building logic.

### Fix — `src/hooks/useAdminReports.ts`

1. **Add `is_active` to the profiles SELECT**: Include `is_active` in the query fields
2. **Filter inactive profiles during row building**: Skip profiles where `is_active === false` before building `allRows`

This matches the pattern used in `useKpiWeightageMatrix` which already filters inactive employees by default.

### Files Changed
1. **`src/hooks/useAdminReports.ts`** — Add `is_active` to profiles query SELECT and filter out inactive employees in the `useMemo` row-building logic

