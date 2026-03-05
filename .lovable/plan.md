

# Fix: Inaccurate Bell Curve Rating Distribution

## Root Cause

Two issues in `src/pages/ManagementDashboard.tsx`:

1. **Missing fallback scores**: The `getScore` function (line 213) skips `hr_pms_score` and `skip_level_score` from the 8-stage fallback chain. Employees reviewed at these stages get a score of 0 instead of their actual rating.

2. **Unweighted averaging**: The bell curve calculation (lines 300-313) uses a **simple average** (`total / count`) of raw KPI scores to classify employees into rating bands. This ignores KPI weightage, so a high-weight KPI scoring 5 and a low-weight KPI scoring 2 yields 3.5 instead of the correct weighted result. This drags employees into lower bands than they belong.

## Changes

### File: `src/pages/ManagementDashboard.tsx`

**Fix 1 — Complete the fallback chain (line 213-215):**
```typescript
const getScore = (kpi: any) => {
  const s = kpi.review_submissions;
  return s?.final_score ?? s?.management_score ?? s?.auditor_score 
    ?? s?.hr_pms_score ?? s?.skip_level_score 
    ?? s?.manager_score ?? s?.self_score ?? 0;
};
```

**Fix 2 — Use weighted average for band classification (lines 300-313):**
Change from `total / count` to `(sum of score * weightage) / (sum of weightage)`:
```typescript
employeeScoreMap.forEach(({ total, weightage }) => {
  const avgScore = weightage > 0 ? total / weightage : 0;
  // ... band classification
});
```
Where `total` accumulates `score * weightage` (not just `score`), and `weightage` accumulates the raw weightage values. This aligns the bell curve with how scores are calculated everywhere else in the system.

**Fix 3 — Update mean/stdDev calculation (lines 317-322):**
Use the same weighted average for computing mean and standard deviation.

## Risk Assessment
- **Data Impact**: None — read-only, no schema changes
- **Regression Risk**: Low — only changes how scores are aggregated for the bell curve display; the top/bottom performers section already uses weighted scores correctly (line 327)
- **UI Impact**: Positive — employees will be classified into the correct rating bands

