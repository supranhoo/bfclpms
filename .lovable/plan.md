

## Add Month Column to Workflow Configuration Excel Export

### What You Asked For
Add a "Month" column to all relevant sheets in the Workflow Configuration Excel export so admins can filter/review month-wise workflow assignments. No UI changes needed.

### Current State
The export has `Review Period` (e.g., "January", "Q1") and `Review Year` columns across sheets 2-4 (Employee Overrides, Department Assignments, PMS Grade Assignments). There is no standalone "Month" column for quick month-level filtering.

### Approach
For period-specific configs, derive the month(s) from the `review_period` value. For monthly periods the month is the period itself; for bi-monthly/quarterly/half-yearly, list the constituent months. For global configs (no period), show "All".

### Implementation

**File: `src/components/admin/WorkflowConfigExport.tsx`**

1. Add a helper function `deriveMonth(reviewPeriod: string | null): string` that maps period names to month(s):
   - Monthly names → return as-is (e.g., "January")
   - Bi-monthly like "Jan-Feb" → "January, February"
   - Quarterly like "Q1" → "January–March"
   - If null (global) → "All Months"

2. Add a `'Month'` column after `'Review Year'` in all three config sheets (Employee Overrides, Department Assignments, PMS Grade Assignments) using the helper.

3. Update `!cols` widths to include the new column (wch: 20).

### Files Changed
| File | Action |
|------|--------|
| `src/components/admin/WorkflowConfigExport.tsx` | Update — add Month column to sheets 2, 3, 4 |

### Risk Assessment
- **Regression**: Zero — export-only change, no UI or data impact
- **Data**: Read-only derivation from existing `review_period` field

