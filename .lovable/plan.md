

# Fix: Import N/A Detection and Data Correction

## Problem

Three KPIs for ABHAS LUHARUWALLA (100856) Sep 2025 have `is_na = false` in the database despite having NULL achieved values. This causes the weighted average to use 100.0 as the denominator instead of 93.5, producing a rating of **3.15** instead of the correct **3.36**.

| KPI | achieved_value | is_na | weightage |
|-----|---------------|-------|-----------|
| Ensure minimu vasriance in Stock audit | NULL | false | 2.50 |
| Evaluates saving through claim | NULL | false | 4.00 |
| Implement inventory...min max levels | NULL | false | 0.00 |

## Root Cause

During import, the `targetAchieved` column for these KPIs was either:
- Empty in the Excel (not the string "NA"), so `parseNumericValue` returned `undefined`
- Or the "NA" text was in the cell but the column header didn't match any expected alias

Since the N/A detection only checks for literal strings ("na", "n/a", etc.), blank cells get `is_na = false` even though the user intended them as N/A.

## Fix Plan

### 1. Database Data Fix (Migration)

Update the 3 review submissions to set `is_na = true` for KPIs that have NULL achieved values and NULL scores:

```sql
UPDATE review_submissions
SET is_na = true, final_score = NULL, self_score = NULL
WHERE kpi_id IN (
  'e38b5740-cd7d-483b-aaba-4860841a5329',  -- Stock audit
  'fbd28bb9-8701-45f9-9441-ecbf726dfbb7',  -- Saving through claim
  'ca47f457-c989-4bf0-8b19-b5ddac981b97'   -- Min max levels
);
```

### 2. Import Logic Fix (`src/pages/admin/ImportData.tsx`)

Enhance the N/A detection (around line 1042-1044) to also treat a genuinely empty/null achieved value as N/A when:
- The `targetAchieved` field from the Excel is explicitly empty or undefined
- AND there is no score data for that KPI (no self/manager/audit ratings)

This prevents future imports from silently storing non-NA submissions with NULL data.

```typescript
// Enhanced N/A detection
const achievedStr = String(achievedValue || '').trim().toLowerCase();
const isNa = achievedStr === 'na' || achievedStr === 'n/a' || 
             achievedStr === 'not applicable' || achievedStr === '-' ||
             // Also treat as NA if no achieved value AND no scores exist
             (!achievedValue && !selfScore && !managerScore && !auditorScore);
```

### 3. Update `DOCUMENTATION.md`

Document the enhanced N/A detection rule: "During import, KPIs with no achieved value and no review scores are automatically marked as N/A."

## Result

After fix, ABHAS LUHARUWALLA Sep 2025: 314.5 / 93.5 = **3.36**
