

# Fix: Edge Function Import Not Setting `is_na` for NA Values

## Root Cause

There are **two import paths** in the system, and they handle "NA" differently:

- **Client-side import** (`ImportData.tsx`) -- correctly detects when `targetAchieved` is "NA", "N/A", "not applicable", or "-" and sets `is_na: true` in the database.
- **Background import** (edge function `import-kpis/index.ts`) -- **always hardcodes `is_na: false`** (line 861). It never checks for NA text. The `parseAchieved` helper converts "NA" to `null` (since `parseFloat("NA")` = `NaN`), so the achieved value becomes null, but `is_na` stays `false`.

**Result:** KPIs imported via the background worker with "NA" in `targetAchieved` end up with `is_na: false` and `achieved_value: null`. The Dashboard then treats them as regular KPIs with a 0 score (included in weighted calculations) instead of excluding them.

### Database Verification

| ref_code  | achieved_value | is_na | final_score |
|-----------|---------------|-------|-------------|
| REF-2060  | 100.00        | false | 5.00        |
| REF-2066  | 0.00          | false | 0.00        |
| REF-2073  | 0.00          | false | 0.00        |
| REF-2075  | null          | false | 0.00        |

REF-2075 is the clearest NA case (null achieved value, but `is_na` is `false`). REF-2066 and REF-2073 have `achieved_value: 0` which could indicate they were parsed as numbers rather than kept as NA -- worth verifying in your original Excel file.

## Fix Plan

### 1. Add NA Detection to Edge Function (`supabase/functions/import-kpis/index.ts`)

Port the same NA detection logic from the client-side import into the edge function, right before building the submission record (around line 830):

```text
// Check if achieved value is N/A
const achievedStr = String(achievedValue ?? '').trim().toLowerCase();
const isNa = achievedStr === 'na' || achievedStr === 'n/a' || 
  achievedStr === 'not applicable' || achievedStr === '-' ||
  (!achievedValue && !row.employeeRating && !row.rating && 
   !row.managerRating && !row.auditRating);
```

Then update the submission record to use `isNa` instead of hardcoded `false`:
- `is_na: isNa`
- When `isNa` is true: null out all scores, ratings, and achieved values

### 2. Fix Existing Data (One-Time SQL Patch)

Run a data fix to correct the already-imported records where `achieved_value` is null but `is_na` is false:

```sql
UPDATE review_submissions
SET is_na = true, 
    final_score = null, 
    final_rating = null
WHERE achieved_value IS NULL 
  AND is_na = false
  AND self_score IS NULL 
  AND manager_score IS NULL 
  AND auditor_score IS NULL;
```

### 3. Update `DOCUMENTATION.md`

Note that both import paths now use identical NA detection logic.

## Files Changed

| File | Change |
|------|--------|
| `supabase/functions/import-kpis/index.ts` | Add NA detection logic, use dynamic `isNa` flag, null out scores when NA |
| `DOCUMENTATION.md` | Document the fix |

## Important Note

For REF-2066 and REF-2073, the database shows `achieved_value: 0.00` -- meaning the import parsed their values as numeric 0, not as "NA" text. Please verify what was actually in your Excel file for those rows. If they truly had "NA" text, the `parseNumericValue` function may have converted them incorrectly upstream.

