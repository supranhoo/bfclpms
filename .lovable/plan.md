

## Add Excel Export to Pending Reviews Page

### Changes

#### File: `src/pages/admin/PendingSelfReviews.tsx`

1. **Add import** for `xlsx` and `Download` icon
2. **Add export function** that exports the currently active tab's data to Excel with columns: Employee, Code, Department, KPI, Pending With, Period
3. **Add an "Export Excel" button** in each tab's action bar (next to existing Push/Penalize buttons)

The function will:
- Determine tab context to set the "Pending With" label (Employee / Manager / Skip-Level Manager / Sent Back)
- Map the tab's data array (`overdueKraSet`, `overdueTeamReview`, `overdueSkipLevel`, `sentBackKpis`) to rows
- Generate and download an `.xlsx` file named `Pending_Reviews_{tab}_{month}_{year}.xlsx`

For the Rollback tab, export both auto-scored and penalized KPIs with an additional "Type" column.

### No database changes needed

