
# Fix: KRA Issuance Dialog Missing Non-Monthly KPIs

## Problem

Employee **Rupesh Kumar Sharma (101851)** has 12 Monthly KPIs totaling **90%** plus 1 Quarterly KPI worth **10%** (total = 100%). The Quarterly KPI has `review_period = 'Q3'` with `frequency_cycle_start = 'Jul-Sep'`, which means Q3 covers **January, February, March**.

However, the KRA Issuance Confirmation dialog only queries `review_period = 'February'`, so it completely misses the Quarterly KPI. This is why the total shows 90% instead of 100%.

## Root Cause

In `KraIssuanceConfirmDialog.tsx` (line 60), the query filters strictly by:
```
.eq('review_period', reviewPeriod)
```

Non-monthly KPIs are stored with period labels like `Q1`, `Q3`, `H1`, `Jan-Dec`, etc. -- not the monthly name. So they never match.

## Fix

### File: `src/components/admin/KraIssuanceConfirmDialog.tsx`

Modify the KPI fetch query to also include non-monthly KPIs whose frequency cycle covers the selected month.

**Approach:**
1. Build a list of all possible `review_period` values that cover the selected month (e.g., for February: `['February', 'Q3', 'Q4', 'H1', 'H2', 'Jan-Dec', 'Apr-Mar', 'Jul-Jun']` depending on cycle configurations).
2. Use `.in('review_period', possiblePeriods)` instead of `.eq('review_period', reviewPeriod)`.

A utility function `getPeriodsContainingMonth(monthName)` will be created in `src/lib/frequencyUtils.ts` that returns all possible period labels (Q1-Q4, H1-H2, Yearly, Bi-Monthly) that could contain a given month, considering all cycle start configurations.

### File: `src/lib/frequencyUtils.ts`

Add a new exported function:

```typescript
export function getAllPeriodsForMonth(monthName: string): string[] {
  // Start with the month itself (for Monthly KPIs)
  const periods: string[] = [monthName];
  const monthNum = getMonthNumber(monthName);
  
  // Check all Quarterly cycle options
  for (const opt of QUARTERLY_OPTIONS) {
    for (const [label, lockedMonths] of Object.entries(opt.lockedMonths)) {
      const activeMonth = findActiveMonthForGroup(lockedMonths);
      if (lockedMonths.includes(monthNum) || activeMonth === monthNum) {
        periods.push(label); // e.g., 'Q3'
      }
    }
  }
  
  // Same for Bi-Monthly, Half-Yearly, Yearly options
  // ...
  
  return [...new Set(periods)];
}
```

### File: `DOCUMENTATION.md`

Version bump to 1.45.69.

## Technical Details

| Aspect | Detail |
|--------|--------|
| Files changed | `src/lib/frequencyUtils.ts`, `src/components/admin/KraIssuanceConfirmDialog.tsx`, `DOCUMENTATION.md` |
| Query change | `.eq('review_period', reviewPeriod)` becomes `.in('review_period', possiblePeriods)` |
| Data impact | None -- read-only query change |
| Regression risk | Low -- only adds more matching KPIs that were previously hidden |
| Performance | Negligible -- same index, slightly broader filter |

## Risk Assessment

| Risk | Mitigation |
|------|-----------|
| Data Impact | Read-only query expansion, no schema changes |
| Workflow Impact | Correctly includes non-monthly KPIs in issuance, improving accuracy |
| Regression Risk | Low -- the query now correctly matches what the employee actually has |
| Weightage Calculation | No change to weightage logic; it will naturally sum correctly once all KPIs are fetched |
