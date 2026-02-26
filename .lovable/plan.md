

# Fix: Binary/Tiered KPI Rating Mismatch Between Org Data Entry and Manager Review

## Root Cause

In the Org KPI Scoped Entry Table, binary KPIs store the **rating number** as `achievedValue` (e.g., "No" stores `0`, "Yes" stores `5`). When the Rating column calls `calculateRating(0, target=0, uomType='binary')`, the function fails to match a label (because the value is numeric, not the string "No") and falls back to numeric threshold logic. With `achieved=0` and `target=0`, this incorrectly produces **Rating 5 (Outstanding)**.

In the Manager Review, the `QualitativeValueInput` component directly uses the option's rating value, so "No" correctly shows **Score: 0**.

## Fix

**File: `src/components/admin/OrgKpiScopedEntryTable.tsx`**

In both `EmployeeRow` and `DepartmentRow`, update the Rating cell logic: for binary/tiered KPIs, use the `achievedValue` directly as the rating score (since it already IS the rating), instead of passing it through `calculateRating()`.

### EmployeeRow Rating cell (lines 329-342):

```typescript
<TableCell className="py-1.5 w-24 text-center">
  {rowIsNa || numVal === null ? (
    <span className="text-xs text-muted-foreground">-</span>
  ) : (row.uomType === 'binary' || (row.uomType === 'tiered' && row.qualitativeOptions?.length)) ? (
    // For qualitative KPIs, achievedValue IS the rating score
    <RatingBadge score={numVal} short className="text-[10px] h-5 px-1.5" />
  ) : (
    <RatingBadge
      score={calculateRating(
        numVal, effectiveTarget, ratingThresholds || { r5: null, r4: null, r3: null, r2: null, r1: null },
        criteria, 0, 'numeric', null, effectiveUom
      ).rating}
      short
      className="text-[10px] h-5 px-1.5"
    />
  )}
</TableCell>
```

### DepartmentRow Rating cell:

Same pattern applied -- check `row.uomType` for binary/tiered and use `numVal` directly as the score.

## Impact

- "No" (achievedValue=0) will correctly show **Rating 0 - Not Achieved** (deep maroon badge)
- "Yes" (achievedValue=5) will correctly show **Rating 5 - Outstanding** (blue badge)
- Numeric KPIs continue to use `calculateRating()` as before
- Consistent behavior between Org KPI Data Entry and Manager Review

## Risk Assessment

| Aspect | Risk | Notes |
|--------|------|-------|
| Data | None | Display-only change, no writes |
| Regression | None | Only affects qualitative KPI rating display |
| Consistency | Improved | Aligns Org KPI table with Manager Review logic |

## Files Changed

| File | Change |
|------|--------|
| `src/components/admin/OrgKpiScopedEntryTable.tsx` | Branch rating display logic for binary/tiered vs numeric KPIs in both EmployeeRow and DepartmentRow |

