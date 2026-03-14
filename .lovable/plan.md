

# Fix: Mismatch Count Not Updating After Weightage Edits

## Analysis

The "204 Mismatches" badge is computed correctly from real data -- there are genuinely 204 KPI rows in the database where the same KPI has different weightage values across months. The count recalculates after every edit because `invalidateQueries` triggers a full refetch.

However, there are two UX problems that make it feel "stuck":

1. **No immediate visual feedback** -- After saving a weightage with "All months" scope, the badge doesn't show any animation or change indicator, so it's unclear whether the number updated.
2. **The count may not decrease if the edit didn't fix a mismatch** -- If the user edits a cell using "This month only" (the default is "forward"), they may actually be *creating* new mismatches or not fixing existing ones.

## Proposed Changes

### File: `src/pages/admin/KpiWeightageDashboard.tsx`

1. **Add a "last updated" flash animation** on the mismatch badge when data refreshes, so the user can visually confirm the number recalculated.
2. **Show a breakdown tooltip** on the mismatch badge: e.g., "204 KPIs have inconsistent weightage across months. Edit a KPI and apply to 'All months' to fix."
3. **Default the WeightageCellEditor scope to 'all' instead of 'forward'** -- since the most common intent on a weightage dashboard is to equalize across all months, this reduces accidental mismatches.

### File: `src/components/admin/WeightageCellEditor.tsx`

4. **Change default scope** from `'forward'` to `'all'` (line 37).
5. **Show affected count preview** -- after selecting a scope, display "Will update X month(s)" so the user knows exactly how many records will be changed.

These are small, targeted changes that make the mismatch count behavior transparent and ensure edits actually fix mismatches.

