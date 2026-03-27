

## Add Month Name to Manager Team KPI Excel Export

### Change
Add a "Month" column to the Excel export in `ManagerTeamKpiReport.tsx` so each row includes the selected review month.

### Implementation — `src/pages/reports/ManagerTeamKpiReport.tsx`

1. **Line 155-164**: Add `'Month': month` to the export mapping object, placed before Employee Code

### Risk Assessment
- Zero risk — one-line addition to export mapping

### Files Changed
1. `src/pages/reports/ManagerTeamKpiReport.tsx`

