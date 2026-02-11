
# Make Summary Cards Reactive to Checkbox Changes

## Problem

In KRA Rollover Step 2 (Preview), the three summary cards ("Ready to rollover", "Have existing KPIs", "Will be skipped") display static numbers from the dry-run response. When you uncheck a conflict employee (meaning they will be skipped), the "Will be skipped" count stays at 0 instead of incrementing.

## Fix

**File: `src/components/admin/RolloverDialog.tsx`**

Make the summary cards compute their values dynamically based on `balanceIds` (the set of checked conflict employees):

- **Ready to rollover**: `previewData.rolled_over.length` (unchanged -- these have no conflicts)
- **Will rollover balance**: `balanceIds.size` (conflict employees with checkbox checked)
- **Will be skipped**: `previewData.skipped_employees.length + (previewData.conflicts.length - balanceIds.size)` (original skipped + unchecked conflict employees)

The middle card label also changes from "Have existing KPIs" to "Balance rollover" to better reflect what checked conflicts mean.

## Technical Detail

Lines ~335-356 in `RolloverDialog.tsx` -- replace the three static cards with computed values:

| Card | Current (static) | New (reactive) |
|---|---|---|
| Ready to rollover | `previewData.rolled_over.length` | Same (no change) |
| Middle card | `previewData.conflicts.length` / "Have existing KPIs" | `balanceIds.size` / "Balance rollover" |
| Will be skipped | `previewData.skipped_employees.length` | `previewData.skipped_employees.length + previewData.conflicts.length - balanceIds.size` |

**File: `DOCUMENTATION.md`** -- Update the rollover section to note that summary cards are reactive.
