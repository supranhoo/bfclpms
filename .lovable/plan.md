

## Fix: Button Count Should Reflect Filtered Selection

### Problem
When the scan runs, ALL KPIs are pre-selected (line 138). When the user filters by period, the table only shows the filtered subset, but the "Confirm & Reconcile" button still counts `selectedKpiIds.size` which includes selections from ALL periods. This is confusing — user sees 26 rows, unticks all but 1, yet the button says "802" because 776 are still selected in other periods.

### Fix in `src/components/admin/ReconcileOrphanedKpisDialog.tsx`

Two changes:

1. **When filter changes, deselect KPIs not in the filtered view**: When `filterPeriod` changes, update `selectedKpiIds` to only keep IDs that are in the new filtered set. This way switching to "January 2026" auto-deselects all non-January KPIs.

2. **Button denominator should use filtered count**: Change line 355 from `dryRunResult.count` to `filteredAffected.length` so the button reads "Confirm & Reconcile 1 of 26 KPI(s)" when filtering January.

### Implementation
- Add a `useEffect` on `filterPeriod` that intersects `selectedKpiIds` with the current `filteredAffected` IDs.
- Update the button text to use `filteredAffected.length` as the denominator.

### Files Changed
- `src/components/admin/ReconcileOrphanedKpisDialog.tsx`

