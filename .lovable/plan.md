

## Add Pagination and Select-All to Incentive Report Table

### Problem
1. **No pagination**: Table hardcodes `filteredRecords.slice(0, 50)` — records beyond 50 are invisible with no way to navigate
2. **Select All only covers visible rows**: `toggleSelectAll` selects only the first 50 records, not all filtered records
3. **No "Select All Records" option**: When 113 records match filters, users cannot bulk-select all of them

### Solution

Add proper pagination with page size selector, and a "Select All X Records" banner (similar to Gmail pattern).

### UI Design

```text
┌─────────────────────────────────────────────────────┐
│ Showing 1-50 of 113 records                        │
│ ┌─────────────────────────────────────────────────┐ │
│ │ ☑ All 50 on this page are selected.             │ │
│ │    Select all 113 records                       │ │
│ └─────────────────────────────────────────────────┘ │
│ [Table rows...]                                     │
│                                                     │
│ ◀ Prev  Page 1 of 3  Next ▶   Show: [50▼]          │
└─────────────────────────────────────────────────────┘
```

### Implementation

**File: `src/components/incentive/MonthlyIncentiveTable.tsx`**

1. **Add pagination state**:
   - `currentPage` (default 1), `pageSize` (default 50, options: 25/50/100/All)
   - Reset `currentPage` to 1 when filters change

2. **Replace hardcoded slice**:
   - `paginatedRecords = filteredRecords.slice((currentPage-1)*pageSize, currentPage*pageSize)`
   - Total pages = `Math.ceil(filteredRecords.length / pageSize)`

3. **Fix toggleSelectAll** — two modes:
   - Checkbox in header selects/deselects current page
   - When all page rows selected, show banner: "All {pageSize} on this page selected. **Select all {total} records**"
   - Clicking "Select all X records" sets all filteredRecord IDs into selectedIds

4. **Add pagination controls** below the table:
   - Prev/Next buttons (disabled at bounds)
   - Page indicator: "Page X of Y"
   - Page size selector: 25, 50, 100, All

5. **Update header text**: "Showing {start}-{end} of {total} records"

6. **Update `allVisibleSelected`** to check current page, not first 50

7. **Documentation** — Version bump in `DOCUMENTATION.md` and `POLICY.md`

### Risk Assessment
- **Data impact**: None — display-only change
- **Regression risk**: Low — pagination replaces hardcoded slice; selection logic is self-contained
- **Performance**: "All" page size option loads all rows in DOM (acceptable for ~200-500 records typical in incentive reports)

