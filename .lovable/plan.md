

# Fix: Review Submission Creation Errors During KPI Import

## Problem
When importing KPIs with review data, if the `review_submissions` insert fails (line 1105-1107 in `ImportData.tsx`), the error is only logged to console. The KPI is still counted as "success", resulting in:
- KPIs that exist but have no review submission record
- Broken workflow (KPI can't be reviewed or scored)
- No user visibility into the failure

## Solution
Instead of silently logging the error, treat a failed review submission as a **partial failure**: mark the row as "failed", roll back the orphaned KPI, and surface the error in the import results.

## Changes

### 1. `src/pages/admin/ImportData.tsx` (lines 1105-1107)
Replace the silent `console.error` with:
- **Rollback the KPI**: Delete the just-inserted KPI row to avoid orphaned data
- **Throw an error** so it's caught by the existing `catch` block on line 1116, which already handles failures correctly (adds to `importErrors`, marks the row as "failed" in results)

```tsx
// BEFORE (silent failure):
if (submissionError) {
  console.error('Failed to create review submission:', submissionError);
}

// AFTER (proper error handling):
if (submissionError) {
  // Rollback: delete the orphaned KPI since its review submission failed
  await supabase.from('kpis').delete().eq('id', newKpi.id);
  throw new Error(`Review submission failed: ${submissionError.message}`);
}
```

This leverages the existing error-handling infrastructure (the `catch` block, `importErrors` array, and `ImportResultsSummary` component) so users see the specific failure in the error report with no additional UI work needed.

### 2. `DOCUMENTATION.md`
Update the import error-handling section to document this fix.

## Technical Details

| File | Change |
|---|---|
| `src/pages/admin/ImportData.tsx` | Replace console.error with KPI rollback + throw on review submission failure |
| `DOCUMENTATION.md` | Document the fix |

## Why Not a Retry Mechanism?
A retry adds complexity with minimal benefit here. The most common causes of submission insert failure (schema mismatch, RLS denial, constraint violation) won't resolve on retry. The rollback-and-report approach gives the user clear feedback so they can fix the data and re-import.

