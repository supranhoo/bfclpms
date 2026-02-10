

# Fix: Preserve All Uploaded Review Data During Import

## Problems Found

### 1. Per-Level Achieved Values Not Stored
The `review_submissions` table has dedicated columns for each level's achieved value (`manager_achieved_value`, `auditor_achieved_value`, `management_achieved_value`), but **neither import path** populates them. Both the edge function and foreground import only store a single `achieved_value` (picking whichever is available using `||` fallback), discarding the individual level values.

### 2. `hasReviewData` Uses Truthy Check (`||`)
The check that determines whether to create a submission record uses `||`:
```
const hasReviewData = row.targetAchieved || row.employeeTargetAchieved || ...
```
This means if a row has `employeeTargetAchieved = 0`, it's treated as falsy and the entire submission (including remarks) is skipped.

### 3. `achieved_value` Fallback Cascade Uses `||`
```
const achievedValue = row.auditTargetAchieved || row.managerTargetAchieved || ...
```
A value of `0` gets skipped in favor of the next level, corrupting the data.

### 4. Bonus Bug: `uom` Variable Undefined in Edge Function
Line 701 references `uom` instead of `row.uom`, making `isPercentageUom` always `false`. This means the threshold fix from the previous change is not actually working in the edge function.

---

## Fix Plan

### File 1: `supabase/functions/import-kpis/index.ts`

**A. Fix undefined `uom` variable (line 701):**
Change `uom` to `row.uom` so the percentage threshold logic actually works.

**B. Fix `hasReviewData` to use nullish checks (line 824):**
Replace `||` with explicit `!= null` checks so that `0` values are not treated as missing.

**C. Fix `achievedValue` fallback to use `??` (line 829):**
Use nullish coalescing so `0` values are preserved.

**D. Store per-level achieved values in submission records (line 843):**
Add `manager_achieved_value`, `auditor_achieved_value` fields when they exist in the uploaded data, using `parseAchieved()` for each.

### File 2: `src/pages/admin/ImportData.tsx`

**A. Fix `hasReviewData` to use nullish checks (line 1035):**
Same fix as edge function -- use `!= null` checks.

**B. Fix `achievedValue` fallback to use `??` (line 1040):**
Use nullish coalescing.

**C. Store per-level achieved values (line 1056):**
Add `manager_achieved_value`, `auditor_achieved_value` to the insert payload.

### File 3: `DOCUMENTATION.md`
Update the import section to document that all per-level values are preserved as-is.

---

## Technical Detail: Submission Record Changes

```text
Before (both paths):
  achieved_value: parseAchieved(auditTarget || managerTarget || employeeTarget || target)
  // Per-level achieved values: NOT stored

After (both paths):
  achieved_value: parseAchieved(row.auditTargetAchieved ?? row.managerTargetAchieved ?? row.employeeTargetAchieved ?? row.targetAchieved)
  manager_achieved_value: parseAchieved(row.managerTargetAchieved)
  auditor_achieved_value: parseAchieved(row.auditTargetAchieved)
```

This ensures the full review trail is preserved exactly as uploaded, regardless of reviewStatus.

