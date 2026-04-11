

## Bug Fix: Compliance Sub-Factors Not Loading from Database

### Root Cause
The `scopedRows` builder in `OrgKpiDataEntry.tsx` (lines 396-409) never maps `val?.sub_factors` to the `subFactors` field when constructing employee rows. This means:
- Existing sub-factor values from the DB are never shown in the admin UI
- Since the UI starts with `subFactors: undefined`, saving overwrites any previously stored values with nothing
- The review journey banner also shows nothing because the DB column remains null after re-saves

### Fix

| # | File | Change |
|---|------|--------|
| 1 | `src/pages/admin/OrgKpiDataEntry.tsx` | Add `subFactors: val?.sub_factors ?? undefined` to the employee-scoped row builder (line ~409) and department-scoped row builder (line ~379) |
| 2 | `DOCUMENTATION.md` | Bug fix note |
| 3 | `POLICY.md` | Sync version |

### Technical Detail
In the `scopedRows` construction at line 396, after `qualitativeOptions`, add:
```typescript
subFactors: val?.sub_factors ?? undefined,
```

Same for department rows at line 367.

This ensures:
- Previously saved sub-factors load into the UI on page open
- Sub-factor changes are preserved across saves
- The review journey compliance banner displays correctly

### Risk Assessment
- **Regression risk**: None — additive property on row data
- **Data impact**: None — only affects UI state initialization

