

# Fix: Binary KPI Propagation Produces Wrong Rating (0 Instead of 5)

## Root Cause

When an admin selects "Yes" for a binary KPI in the Org KPI Data Entry table, the system stores the **rating score** (5) as the `achievedValue`. During propagation, the `buildRatingsPayload` function in `usePropagateOrgKpiValue.ts` passes this numeric `5` to `calculateRating()`.

Inside `calculateRating`, for binary UOM types:
1. It first tries **label matching** (looking for "Yes"/"No" string) -- fails because `5` is a number, not a string
2. Falls through to **numeric threshold fallback** -- calls `calculateAbsoluteRating(5, thresholds, "Lower is Better")`
3. With thresholds like `r5 = 0` (zero fatals = outstanding), the value `5` with "Lower is Better" criteria yields **Rating 0**

This is why the Review Journey shows `Value: 5, Rating: 0` -- the database has `self_score = 0` because the propagation incorrectly recalculated the score.

## Fix

**File: `src/hooks/usePropagateOrgKpiValue.ts`** -- `buildRatingsPayload` function (lines 70-93)

For binary and tiered KPIs, the `achievedValue` already IS the rating score (mapped from "Yes"=5, "No"=0 by the QualitativeSelect component). Skip `calculateRating()` and use it directly:

```typescript
// Before threshold calculation, check if this is a qualitative KPI
const uomType = (kpi.uom_type as string) || 'numeric';
const isBinaryOrTiered = uomType === 'binary' || 
  (uomType === 'tiered' && Array.isArray(kpi.qualitative_options) && kpi.qualitative_options.length > 0);

if (isBinaryOrTiered) {
  // achievedValue IS the rating for qualitative KPIs
  const directRating = achievedValue ?? 0;
  kpiRatings.push({
    kpi_id: kpi.id,
    achieved_value: achievedValue,
    self_score: directRating,
    self_rating: scoreToRating(directRating),
  });
} else {
  // Existing calculateRating logic for numeric KPIs
  const ratingResult = calculateRating(...);
  kpiRatings.push({ ... });
}
```

## Impact

- "Yes" (achievedValue=5) will correctly propagate as `self_score=5, self_rating=blue`
- "No" (achievedValue=0) will correctly propagate as `self_score=0, self_rating=red`
- Numeric KPIs continue to use `calculateRating()` as before
- The Review Journey will correctly display **Rating: 5** for binary "Yes" selections

## Existing Data

Any previously propagated binary KPIs will have incorrect `self_score` values in the database. The admin can re-propagate affected KPIs from the Org KPI Data Entry page to fix them.

## Risk Assessment

| Aspect | Risk | Notes |
|--------|------|-------|
| Data | None | Only affects future propagations; re-propagation fixes historical data |
| Regression | None | Numeric KPIs unchanged; only binary/tiered path added |
| Consistency | Improved | Aligns propagation with Org KPI table display and Manager Review logic |

## Files Changed

| File | Change |
|------|--------|
| `src/hooks/usePropagateOrgKpiValue.ts` | Short-circuit `buildRatingsPayload` for binary/tiered KPIs to use achievedValue directly as the rating score |
