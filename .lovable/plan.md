

## Show All Periods in Filter (Including Zero-Mismatch Months)

### Problem
Currently, `periodOptions` is derived only from `dryRunResult.affected`, so months with zero mismatches never appear in the dropdown. The user wants all active review periods shown, with a visual indicator when a month has no issues.

### Changes to `src/components/admin/ReconcileOrphanedKpisDialog.tsx`

1. **Import `useDistinctKpiPeriods`** from `src/hooks/useKpis.ts` to fetch all existing review period+year combinations from the database.

2. **Merge all periods into dropdown options**: Combine the periods from `useDistinctKpiPeriods` with the periods from `dryRunResult.affected`. Build a list of `{ label, count }` objects where `count` is the number of affected KPIs for that period.

3. **Show count in dropdown items**: Each `SelectItem` will display the period name plus a count badge, e.g. `"February 2026 (801)"` or `"March 2026 (0)"`. Zero-count items get a green checkmark or "(0 issues)" indicator to signal no mismatches.

4. **Always show the filter** (remove the `periodOptions.length > 1` guard) since all periods will now be listed regardless of whether they have issues.

5. **Sort periods chronologically** using month order + year, consistent with existing sorting in `useDistinctKpiPeriods`.

### Single file change
- `src/components/admin/ReconcileOrphanedKpisDialog.tsx`

