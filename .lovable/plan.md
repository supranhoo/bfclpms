

## Reconciliation Dialog: Add Period Column and Enlarge Dialog

### Changes to `src/components/admin/ReconcileOrphanedKpisDialog.tsx`

1. **Enlarge the dialog**: Change `max-w-3xl` to `max-w-6xl` and increase the table scroll area from `max-h-[40vh]` to `max-h-[50vh]` for better visibility.

2. **Add Period/Month column to the table**: Add a new "Period" column header after "Employee", and render `item.review_period` + `item.review_year` (e.g., "February 2026") in each row.

3. **Truncate KPI name**: Apply the existing truncation pattern (cut text before "Formula"/"Scoring"/"Logic") so KPI names don't overflow the table, keeping it compact.

### Files Changed
- `src/components/admin/ReconcileOrphanedKpisDialog.tsx`

