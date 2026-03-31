

## RCA & Fix: Management N/A Not Clearing Final Score

### Root Cause

**File**: `src/hooks/useAdminDataEntry.ts`, lines 320-372

When admin marks a KPI as N/A for management on an already-approved KPI:

1. Step 2b correctly sets `is_na = true`, `final_score = null`, `management_score = null` in the upsert payload
2. Step 4 upsert writes these to the database correctly
3. **Step 8 (recompute)** immediately re-fetches the submission and runs the 8-stage fallback chain — finds `auditor_score = 0`, and **patches final_score back to 0**

The recompute block has no `is_na` guard. It unconditionally overwrites final_score with the first non-null score from the fallback chain.

**DB confirmation**: KPI `f457fd99` has `is_na = true` but `final_score = 0.00`, `final_rating = red` — the recompute overwrote the null.

### Fix

**`src/hooks/useAdminDataEntry.ts`** — Add `is_na` guard to the recompute block (step 8):

```typescript
// Before the recompute logic at line 324:
if (shouldRecomputeFinal && newSubmission) {
  const freshSub = ...;
  
  // NEW: If N/A was just set, force final_score to null — don't run fallback chain
  if (freshSub?.is_na === true) {
    if (freshSub.final_score !== null) {
      await supabase.from('review_submissions')
        .update({ final_score: null, final_rating: null })
        .eq('kpi_id', kpi_id);
    }
  } else {
    // existing fallback chain logic
  }
}
```

**DB repair migration**: Fix the existing corrupted record:
```sql
UPDATE review_submissions 
SET final_score = NULL, final_rating = NULL 
WHERE is_na = true AND final_score IS NOT NULL;
```

### Files Modified

| File | Change |
|------|--------|
| `src/hooks/useAdminDataEntry.ts` | Add `is_na` guard before fallback chain recompute |
| DB migration | Repair existing records where `is_na = true` but `final_score` is not null |
| `DOCUMENTATION.md` | v2.15.35 |

### Risk Assessment
- **Regression**: None — only adds a guard before existing logic; non-N/A path unchanged
- **Dashboard Safety**: No RLS changes
- **Data**: Migration is corrective — only nullifies scores already marked N/A

