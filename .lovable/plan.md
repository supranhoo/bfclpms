

## Add Sorting on Code and Reviewer Columns in Pending Review Tables

### Changes

#### File: `src/pages/admin/PendingSelfReviews.tsx`

1. **Add sorting state**: A `sortField` (`'code' | 'reviewer' | null`) and `sortDirection` (`'asc' | 'desc'`) state pair, shared across tabs.

2. **Add sort helper**: A `sortItems` function that takes an `OverdueKpi[]` array and returns a sorted copy based on `sortField`/`sortDirection`:
   - `code`: sort by `item.employeeCode`
   - `reviewer`: sort by `item.reportingManagerName` (or `item.skipLevelManagerName` for the skip-level tab)

3. **Make column headers clickable**: Replace plain `<TableHead>Code</TableHead>` and `<TableHead>Reviewer</TableHead>` with clickable headers showing an arrow icon (ArrowUpDown/ArrowUp/ArrowDown) in all three pending tabs (Self-Review, Manager Review, Skip-Level Review).

4. **Apply sorting**: Wrap each tab's data array through the sort function before mapping rows: `sortItems(overdueKraSet, 'self')`, `sortItems(overdueTeamReview, 'manager')`, `sortItems(overdueSkipLevel, 'skip')`.

### No database changes needed

