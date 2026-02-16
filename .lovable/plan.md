

# RCA and CAPA: Incorrect Scoring for Percentage UOM KPIs

## Root Cause Analysis (RCA)

### What Happened
The KPI "Achieve 3*100 TPD Power Generation target" for January 2026 has:
- **UOM**: % (Percentage)
- **Target**: 20%
- **Thresholds**: R5: 20%, R4: 15%, R3: 10%, R2: 5%, R1: 1%
- **Achieved Value Propagated**: **37,560** (raw production quantity in MW)
- **Resulting Self Score**: **Rating 5** (incorrect)

### Why It Happened
The data owner entered **37,560** (a raw power generation number) into a field that expects a **percentage value** (0-20% incentive range). The scoring engine's `calculatePercentageRating` function correctly compared the value against thresholds: `37,560 >= 20` evaluates to `true`, producing Rating 5.

The scoring engine is working as designed -- this is a **garbage-in, garbage-out** problem. There is **no validation** at the data entry or propagation stage to catch values that are wildly out of range relative to the KPI's thresholds.

### Scope of Impact
A database audit found:
- **1,053** total % UOM KPIs with submissions
- **105** have achieved values exceeding 100 (with targets at or below 100) -- potentially suspicious
- **1** extreme outlier: the 37,560 value (1,878x the target)

Many of the 105 may be legitimate (e.g., 215% training completion), but some are clearly wrong-domain values being scored incorrectly.

## Corrective and Preventive Action (CAPA)

### Fix 1: Add Threshold-Aware Validation Warning on Org KPI Data Entry

Add a visual warning on the `OrgKpiEntryCard` when the entered value appears unreasonable relative to the KPI's thresholds:

- For % UOM: warn if the value exceeds 2x the R5 threshold (e.g., R5=20% means warn if value > 40)
- For all UOMs: warn if the value exceeds 10x the target value
- Display an orange warning banner: "This value seems unusually high/low for this KPI. Please verify before saving."
- The warning is **non-blocking** -- it does not prevent saving, only alerts the user

### Fix 2: Show Simulated Rating in Propagation Confirmation Dialog

Before propagating, the confirmation dialog should display the **computed rating** so the data owner can verify:

- Show: "Value: 37,560 will result in Rating 5 for all X employees"
- If the rating is 0 or 5, highlight it in a different color to draw attention
- This gives the data owner a chance to catch errors before they affect scorecards

### Fix 3: Add Validation Warning on Self-Review Achieved Value Input

Apply the same threshold-aware warning to the `AchievedValueScoreInput` component used during self-review, so employees also see warnings for out-of-range values.

## Technical Details

### Files to Change

| File | Change |
|---|---|
| `src/components/admin/OrgKpiEntryCard.tsx` | Add threshold-aware validation warning when entered value is far outside expected range |
| `src/components/admin/OrgKpiScopedEntryTable.tsx` | Same validation warning for department/employee-scoped entry rows |
| `src/components/review/AchievedValueScoreInput.tsx` | Add out-of-range warning for self-review numeric inputs |
| `src/lib/ratingCalculation.ts` | Export a new `isValueOutOfRange()` utility that checks if a value is unreasonable relative to thresholds and target |
| `DOCUMENTATION.md` | Document the new validation warnings |

### Validation Logic (new utility in `ratingCalculation.ts`)

```typescript
export function isValueOutOfRange(
  value: number,
  target: number | null,
  thresholds: RatingThresholds,
  uom: string | null
): { outOfRange: boolean; message: string | null } {
  // For % UOM: warn if value > 2x the highest threshold
  if (uom === '%' || uom?.toLowerCase() === 'percentage') {
    const maxThreshold = Math.max(
      parseThreshold(thresholds.r5, false) ?? 0,
      parseThreshold(thresholds.r4, false) ?? 0,
      parseThreshold(thresholds.r3, false) ?? 0,
    );
    if (maxThreshold > 0 && value > maxThreshold * 2) {
      return {
        outOfRange: true,
        message: `Value ${value} is significantly higher than the R5 threshold (${maxThreshold}). Please verify this is the correct percentage value.`
      };
    }
  }
  // For any UOM: warn if value > 10x target
  if (target && target > 0 && value > target * 10) {
    return {
      outOfRange: true,
      message: `Value ${value} is more than 10x the target (${target}). Please verify.`
    };
  }
  return { outOfRange: false, message: null };
}
```

### Warning UI (in OrgKpiEntryCard)

An inline alert below the input field:
```
[Warning icon] This value (37,560) is significantly higher than the 
R5 threshold (20). Please verify this is the correct percentage value, 
not a raw production number.
```

### Note on Existing Data

The 37,560 value for January 2026 is already propagated. After the fix is deployed, the admin should:
1. Unlock the KPI
2. Enter the correct incentive percentage
3. Re-propagate

This plan does not include automatic data correction -- it adds guardrails to prevent future occurrences.

