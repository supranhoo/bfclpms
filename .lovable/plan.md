

# Fix: Rating Calculation to Exclude Only N/A KPIs

## Your Logic (Confirmed Correct)

- If `is_na === true` (targetAchieved = "NA"): exclude from **both** numerator AND denominator
- All other KPIs (score = 0, NULL, or any value): include in **both** numerator AND denominator

## Current Bug (3 files)

All three calculation locations include **every** KPI in the denominator regardless of N/A status. They never check `is_na`:

| File | Lines | Issue |
|------|-------|-------|
| `Dashboard.tsx` | 193-205 | No `is_na` check -- all KPIs counted |
| `SelfReview.tsx` | 193-200 | Same -- no `is_na` check |
| `UnifiedScorecard.tsx` | 283-310 | Has `is_na` skip but then uses `score > 0` gate on line 301 which excludes 0-score KPIs from numerator AND denominator (inflating rating) |

### Example: ABHAS LUHARUWALLA (100856) Sep 2025
- 3 N/A KPIs with weightage 6.5 -- should be excluded (both sides)
- Remaining effective weight: 93.5
- Weighted score sum: 314.5
- **Correct rating**: 314.5 / 93.5 = **3.36**
- **Current app shows**: ~4.28 (because KPIs with NULL/0 scores are excluded from denominator)

## Fix (3 files)

### 1. `src/pages/Dashboard.tsx` (~line 198)

```typescript
data.forEach(kpi => {
  const submission = submissionMap.get(kpi.id);
  if (submission?.is_na) return; // Skip N/A from both sides
  
  const score = submission?.final_score || submission?.self_score || 0;
  const weight = kpi.weightage || 0;
  totalScore += score * weight;
  totalWeight += weight;
  totalMaxScore += weight * 5;
});
```

### 2. `src/pages/SelfReview.tsx` (~line 193)

Same pattern -- add `if (submission?.is_na) return;` before score calculation.

### 3. `src/components/review/UnifiedScorecard.tsx` (~line 299-306)

Remove the `if (score > 0)` gate. Non-NA KPIs with 0 score must still count in both numerator and denominator:

```typescript
if (weight > 0) {
  existing.dynamicWeightage += weight;
  // Always include non-NA KPIs in both sides
  totalWeightedScore += score * weight;
  totalWeight += weight;
  existing.totalScore += score * weight;
  existing.totalWeight += weight;
}
```

### 4. `DOCUMENTATION.md`

Update scoring logic section to document: "N/A KPIs are excluded from both numerator and denominator. All other KPIs (including those with 0 or NULL scores) are included in both."

## Result

After fix, ABHAS LUHARUWALLA Sep 2025 will show **3.36** instead of 4.28, matching your manual calculation.

