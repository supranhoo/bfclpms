

# Fix: Qualitative Select Not Showing Saved Value (v1.46.10)

## Root Cause

When a KPI has `uom_type = 'binary'` but `qualitative_options` is `null` in the database, the value-to-label lookup fails because it searches an empty array (`[]`), while the `QualitativeSelect` component internally falls back to `BINARY_OPTIONS` (`Yes=5, No=0`) for its dropdown items.

The mismatch:
- **Dropdown options**: `QualitativeSelect` uses `BINARY_OPTIONS` as fallback when `qualitativeOptions` is null and `uomType` is `'binary'`
- **Value lookup**: The parent code uses `row.qualitativeOptions || []` -- which is `[]` when null -- so `opts.find(...)` never matches, and the value stays as `null` / "Select..."

## Fix

Use the same fallback logic as `QualitativeSelect` when computing the display value. Replace:
```
const opts = row.qualitativeOptions || [];
```
with:
```
const opts = row.qualitativeOptions?.length
  ? row.qualitativeOptions
  : (row.uomType === 'binary' ? BINARY_OPTIONS : []);
```

This must be applied in **3 locations** across 2 files:

| File | Location | Line |
|------|----------|------|
| `OrgKpiScopedEntryTable.tsx` | EmployeeRow value lookup | ~286 |
| `OrgKpiScopedEntryTable.tsx` | DepartmentRow value lookup | ~400 |
| `OrgKpiEntryCard.tsx` | Org-scope value lookup | ~335 |

Additionally, import `BINARY_OPTIONS` from `@/lib/qualitativeUom` in `OrgKpiScopedEntryTable.tsx` (it's already imported in `OrgKpiEntryCard.tsx` via the `QualitativeOption` type but `BINARY_OPTIONS` itself needs to be imported).

## Risk Assessment

| Aspect | Risk | Mitigation |
|--------|------|-----------|
| Data impact | None | Read-only display fix |
| Regression | None | Only changes fallback array for value lookup; numeric KPIs unaffected |

