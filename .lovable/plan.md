

# Revert: Remove Incorrect `is_issued` Filter from Dashboard (v1.45.95)

## Root Cause

The v1.45.94 fix applied an `is_issued !== false` filter to four dashboard components based on the incorrect assumption that `is_issued = false` meant "draft/template KPI." In reality, `is_issued` defaults to `false` in the database schema and was only explicitly set to `true` for 18 out of 83 employees. The filter removed 1,057 out of 1,373 KPIs (77%) and made 65 employees completely invisible on the dashboard.

### Database Evidence (January 2026)

```text
is_issued  | Employees | KPIs
-----------+-----------+------
false      |        65 | 1,057  <-- ALL removed by filter
true       |        18 |   316  <-- only these survived
```

65 employees (including Shrikant Ganguly with 17 KPIs) have ONLY `is_issued=false` records and were completely wiped from the dashboard.

## Solution

Remove the `is_issued` filter from all four dashboard components where it was added in v1.45.94. The `is_issued` flag is not a reliable indicator of draft vs. active KPIs -- it is simply an unset default for the vast majority of records.

## Technical Changes

### 1. `src/components/review/EmployeeSelectorGrid.tsx`

Remove the `issuedPeriodKpis` filter and revert to using `rawPeriodKpis` (renamed back to `periodKpis`) directly:

- Remove lines ~150-153 that filter `is_issued !== false`
- Rename `rawPeriodKpis` back to `periodKpis` in the destructured query result
- Remove all references to `issuedPeriodKpis` (revert to `periodKpis`)

### 2. `src/components/review/AuditScorecard.tsx`

Remove the `(k as any).is_issued !== false` condition from the KPI filtering useMemo.

### 3. `src/components/review/UnifiedScorecard.tsx`

Remove the `(k as any).is_issued !== false` condition from the KPI filtering useMemo.

### 4. `src/components/review/ManagementScorecard.tsx`

Remove the `(k as any).is_issued !== false` condition from the KPI filtering useMemo.

### 5. `src/hooks/useBottleneckReport.ts`

Remove the `(kpi as any).is_issued !== false` condition from the two filter calls (lines ~82 and ~123). This filter was also incorrectly excluding legitimate KPIs from the bottleneck report.

### 6. `DOCUMENTATION.md`

Bump to v1.45.95. Remove the "is_issued filtering contract" from the documentation. Add a note that `is_issued` defaults to `false` and is NOT a reliable draft indicator -- it must not be used for filtering without first ensuring all legitimate KPIs have the flag set correctly.

## Impact

- All 65 missing employees (including Shrikant Ganguly) will reappear on the dashboard
- All 1,057 previously-hidden KPIs will be restored to dashboard stats
- Bottleneck Report will also show the full KPI set
- Dashboard numbers will return to their pre-v1.45.94 state

## Risk Assessment

| Aspect | Risk | Mitigation |
|--------|------|-----------|
| Data accuracy | Dashboard counts will increase back to pre-fix levels | These are real KPIs, not phantoms |
| Regression | None -- this is a pure revert of the incorrect filter | Restores original behavior |
| Future fix | If `is_issued` filtering is ever needed, a data migration must first set `is_issued=true` for all legitimate KPIs | Do not re-apply filter without migration |

