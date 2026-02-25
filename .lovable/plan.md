

# Fix: Binary/Tiered KPIs Showing Wrong Input in Org Data Entry (v1.46.11)

## Root Cause

Database analysis reveals the core problem: **256 out of 258 binary org KPIs have `qualitative_options = NULL`** and `uom = 'Number'`. These KPIs are "binary outcome" metrics (e.g., "0 incidents = Rating 5, any incident = Rating 0") that use **numeric achieved values** (actual counts like 0, 1, 2) -- not qualitative labels like "Yes/No."

The v1.46.8 change incorrectly renders a QualitativeSelect dropdown for ALL KPIs with `uom_type = 'binary'`, then falls back to BINARY_OPTIONS (Yes=5, No=0). This causes two problems:

1. **Wrong input type**: Users see "Yes/No" dropdown instead of a numeric field for entering actual counts
2. **Data corruption on re-fetch**: Previously saved numeric values (e.g., `0` meaning "zero incidents") get misinterpreted as rating `0` and displayed as "No" -- which is incorrect

## Fix

Only render `QualitativeSelect` when the KPI actually has **populated `qualitative_options`**. When `qualitative_options` is null or empty, always use the numeric input regardless of `uom_type`.

**Change the condition from:**
```
row.uomType === 'binary' || row.uomType === 'tiered'
```

**To:**
```
(row.uomType === 'binary' || row.uomType === 'tiered') && row.qualitativeOptions?.length
```

## Files to Edit

| File | Location | Change |
|------|----------|--------|
| `OrgKpiEntryCard.tsx` | Org-scope input (~line 329) | Add `&& data.qualitativeOptions?.length` to condition |
| `OrgKpiScopedEntryTable.tsx` | EmployeeRow (~line 281) | Add `&& row.qualitativeOptions?.length` to condition |
| `OrgKpiScopedEntryTable.tsx` | DepartmentRow (~line 388) | Add `&& row.qualitativeOptions?.length` to condition |
| `OrgKpiScopedEntryTable.tsx` | `allQualitative` check (~line 52) | Update to also require populated options |

This is a 4-line fix across 2 files.

## Risk Assessment

| Aspect | Risk | Mitigation |
|--------|------|-----------|
| Data impact | Positive -- stops misinterpreting numeric values as ratings | No DB changes |
| Regression | None | KPIs with actual qualitative_options (2 records) still work correctly |
| Backward compat | Good | Previously saved numeric values will display correctly again |

