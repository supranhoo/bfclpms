

## Make Summary Badges Dynamic with Period Filter

### Problem
The "827 KPI(s)" badge and the reason breakdown badges always show totals from the full dry-run result, even when a period filter is active. They should reflect the filtered count.

### Fix in `src/components/admin/ReconcileOrphanedKpisDialog.tsx`

Change the summary badges (lines 233-244) to use `filteredAffected` instead of `dryRunResult.affected` / `dryRunResult.count`:

- **Total badge**: `{filteredAffected.length} KPI(s)` instead of `{dryRunResult.count} KPI(s)`
- **Reason breakdown badges**: Compute `orphaned`, `completed`, `mismatch`, `notForwarded` counts from `filteredAffected` instead of `dryRunResult.affected`

This is a ~4-line change in a single file.

