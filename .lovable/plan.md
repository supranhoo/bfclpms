

## Bug Fix: Compliance Sub-Factors Not Being Saved to Database

### Root Cause
The `handleCardSave` function in `OrgKpiDataEntry.tsx` does **not** include `sub_factors` in the save payload. The `OrgKpiEntryCard` correctly collects sub-factor data and passes it via `scopedValues[].subFactors`, but the save handler ignores it entirely — the `toSave` object (lines 498-511) never maps `sv.subFactors` to `sub_factors`.

Additionally, the `values` type on line 452 doesn't include `subFactors` in the `scopedValues` type definition.

### Fix Plan

| # | File | Change |
|---|------|--------|
| 1 | `src/pages/admin/OrgKpiDataEntry.tsx` | In `handleCardSave`: (a) Update the `values` parameter type to include `subFactors` in `scopedValues`, (b) Add `sub_factors: sv.subFactors` to the `toSave` object at line ~510 |
| 2 | `DOCUMENTATION.md` | Add bug fix note to version history |
| 3 | `POLICY.md` | Sync version |

### Technical Detail

In `handleCardSave`, the scoped values loop (line 487) builds a `toSave` object but omits `sub_factors`. The fix adds one line:

```typescript
// Inside the scopedValues.forEach block, add to the toSave object:
sub_factors: (sv as any).subFactors || undefined,
```

This ensures that when HR enters compliance sub-factor values (Policy Compliance, Policy Training, Other Observation), they are persisted to the `org_kpi_values.sub_factors` JSONB column. The submission date auto-fetch and the review journey banner will then display correctly since the data will exist in the database.

### Risk Assessment
- **Data impact**: None — additive change, only writes `sub_factors` when provided
- **Regression risk**: Minimal — existing save flow unchanged for non-compliance KPIs
- **Fix scope**: Single file change + docs sync

