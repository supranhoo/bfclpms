

## Replace Period Column with Period Filter Dropdown

### Changes to `src/components/admin/ReconcileOrphanedKpisDialog.tsx`

1. **Add period filter state**: Add `filterPeriod` state (default `'all'`) that holds the selected period string like `"February 2026"` or `"all"`.

2. **Extract unique periods from dry-run results**: After dry-run completes, compute distinct `"{month} {year}"` values from `dryRunResult.affected` for the filter dropdown options.

3. **Add filter dropdown in the summary bar**: Place a `Select` component next to the summary badges (right-aligned) letting the user filter by period. Show "All Periods" as default.

4. **Filter the displayed rows**: Apply `filterPeriod` to filter `dryRunResult.affected` before rendering the table. The select-all checkbox and the footer count should reflect the filtered list.

5. **Remove the "Period" column**: Remove the `<TableHead>Period</TableHead>` and the corresponding `<TableCell>` that shows `review_period + review_year`.

6. **Update selection logic**: When filtering, the select-all checkbox should toggle only the visible (filtered) KPI IDs. The "Confirm & Reconcile" button still shows total selected count across all periods.

### Files Changed
- `src/components/admin/ReconcileOrphanedKpisDialog.tsx`

