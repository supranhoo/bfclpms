

## Plan: Merge Incentive Report & Monthly Report into Single Tab

### Problem
Two tabs ("Incentive Report" and "Monthly Report") show nearly identical data. The only differences are:
- Monthly Report has action buttons (Compute, Confirm All, Mark Paid, Status Override)
- Incentive Report supports "All" months/years and batched fetching
- Incentive Report has DQ badge with tooltip; Monthly has inline DQ reason

### Approach
Keep the **MonthlyIncentiveTable** as the single unified component, enhancing it with the best features from both.

### Changes

**`src/components/incentive/MonthlyIncentiveTable.tsx`**:
1. Add "All" option to Month and Year dropdowns (currently requires a specific selection)
2. Switch data fetching: when "All" is selected for month/year, use `useIncentiveReportData` (batched, no row limit); when specific month+year selected, use `useIncentiveRecords` (standard query)
3. Add Period filter dropdown from IncentiveReportExport
4. Add DQ tooltip from IncentiveReportExport (hover on DQ badge shows reasons)
5. Enhance Excel export to include all 28 columns from IncentiveReportExport (BU, Division, Designation, etc.)
6. Add "All Programmes" option to programme dropdown (currently only shows active programs with no "all" option)

**`src/pages/reports/IncentiveReport.tsx`**:
- Remove the "Incentive Report" tab and "Monthly Report" tab — keep only one tab called "Incentive Report"
- Keep "Retroactive Adjustments" as a second tab
- Render `MonthlyIncentiveTable` directly under the first tab

**`src/components/incentive/IncentiveReportExport.tsx`**:
- Delete this file (all features merged into MonthlyIncentiveTable)

**`DOCUMENTATION.md`** — v2.15.37, note merge

### Files Modified

| File | Change |
|------|--------|
| `src/components/incentive/MonthlyIncentiveTable.tsx` | Add "All" filters, batched fetch, period filter, DQ tooltip, enhanced export |
| `src/pages/reports/IncentiveReport.tsx` | Remove duplicate tabs; two tabs: "Incentive Report" + "Retroactive Adjustments" |
| `src/components/incentive/IncentiveReportExport.tsx` | Delete |
| `DOCUMENTATION.md` | v2.15.37 |

### Risk Assessment
- **Regression**: Low — combining existing working features; no new logic
- **Data**: No schema or RLS changes
- **UX**: Simpler navigation; all capabilities in one place

