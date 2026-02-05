
# Plan: Fix Missing UOM Parameter in Rating Calculations

## Problem Summary

The KPI **"naye style k KPI Scores dalenge hum yaha"** with:
- **UOM**: `%` (Percentage)
- **Criteria**: Higher is Better
- **R5**: `>98` → parsed as `98`
- **Achieved Value**: `98`

**Expected**: Rating 5 (since 98 ≥ 98)  
**Actual**: Rating 4

## Root Cause

Two components call `calculateRating()` without passing the `uom` parameter. When `uom` is not passed, the function falls back to **ratio-based calculation** instead of using the **direct threshold comparison** logic for Percentage UOM.

| File | Line | Issue |
|------|------|-------|
| `src/pages/SelfReview.tsx` | 321 | Missing `uomType`, `qualitativeOptions`, `uom` parameters |
| `src/components/dashboard/KpiLogicModal.tsx` | 442-448 | Missing last 3 parameters |

### Current (WRONG) Call in SelfReview.tsx:
```typescript
return calculateRating(
  achieved,
  kpi.target_value,
  thresholds,
  kpi.criteria || 'Higher is Better',
  kpi.weightage || 0
);  // ❌ Missing uomType, qualitativeOptions, uom
```

### Correct Call (from MyKpis.tsx for reference):
```typescript
return calculateRating(
  achieved,
  kpi.target_value,
  thresholds,
  kpi.criteria || 'Higher is Better',
  kpi.weightage || 0,
  uomType,                         // ✅
  kpi.qualitative_options,         // ✅
  kpi.uom                          // ✅ Required for % UOM handling
);
```

---

## Solution

### 1. Fix SelfReview.tsx (Line 321)

Add the missing parameters:

```typescript
// Line 321 - Change from:
return calculateRating(achieved, kpi.target_value, thresholds, kpi.criteria || 'Higher is Better', kpi.weightage || 0);

// To:
return calculateRating(
  achieved,
  kpi.target_value,
  thresholds,
  kpi.criteria || 'Higher is Better',
  kpi.weightage || 0,
  uomType,
  kpi.qualitative_options as QualitativeOption[] | null,
  kpi.uom
);
```

Also need to add import for `QualitativeOption` type.

### 2. Fix KpiLogicModal.tsx (Lines 442-448)

Add the missing parameters:

```typescript
// Lines 442-448 - Change from:
const result = calculateRating(
  achievedNum,
  kpi.target_value,
  { r5: kpi.r5, r4: kpi.r4, r3: kpi.r3, r2: kpi.r2, r1: kpi.r1, r0: kpi.r0 },
  kpi.criteria || 'Higher is Better',
  kpi.weightage || 0
);

// To:
const result = calculateRating(
  achievedNum,
  kpi.target_value,
  { r5: kpi.r5, r4: kpi.r4, r3: kpi.r3, r2: kpi.r2, r1: kpi.r1, r0: kpi.r0 },
  kpi.criteria || 'Higher is Better',
  kpi.weightage || 0,
  kpi.uom_type || 'numeric',
  kpi.qualitative_options || null,
  kpi.uom
);
```

---

## File Changes

| File | Change |
|------|--------|
| `src/pages/SelfReview.tsx` | Add missing `uomType`, `qualitativeOptions`, `uom` parameters to line 321 |
| `src/components/dashboard/KpiLogicModal.tsx` | Add missing parameters to lines 442-448 |

---

## Expected Behavior After Fix

For the problematic KPI:
1. `calculateRating()` receives `uom = '%'`
2. Function branches to `calculatePercentageRating()`
3. Compares `98 >= 98` (R5 threshold) → **TRUE**
4. Returns **Rating 5**

---

## Components Affected

All these areas will now correctly calculate % UOM KPIs:

| Component | Status After Fix |
|-----------|-----------------|
| Self Review Page | ✅ Fixed |
| KPI Logic Modal (debug tool) | ✅ Fixed |
| My KPIs Page | Already correct |
| Scoring Simulator | Already correct |
| AchievedValueScoreInput | Already correct |

---

## Validation Checklist

After implementation:
- [ ] % KPIs on Self Review page calculate correctly
- [ ] % KPIs in KPI Logic Modal debug tool show correct ratings
- [ ] Existing numeric KPIs still work (no regression)
- [ ] The specific KPI "5ka dum" shows Rating 5 when achieved = 98
