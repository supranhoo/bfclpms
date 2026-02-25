

# Support Binary/Tiered KPIs in Org KPI Data Entry (v1.46.8)

## Overview

When an Org-level KPI has `uom_type` set to `binary` or `tiered`, the data entry interface should show a dropdown selector (using the existing `QualitativeSelect` component) instead of a numeric input -- both for org-scope cards and for individual employee/department rows in the scoped entry table.

## Technical Changes

### 1. Extend `OrgKpiCardData` interface (`OrgKpiEntryCard.tsx`)

Add two new optional fields:
- `uomType?: 'numeric' | 'binary' | 'tiered' | null`
- `qualitativeOptions?: Array<{ label: string; rating: number; definition: string }> | null`

### 2. Pass data through in `buildCardData` (`OrgKpiDataEntry.tsx`)

In the `buildCardData` function (~line 404-428), add:
```
uomType: (kpi as any).uom_type || 'numeric',
qualitativeOptions: (kpi as any).qualitative_options || null,
```

Also pass these to scoped rows so the table knows the UOM type.

### 3. Update `ScopedRow` interface (`OrgKpiScopedEntryTable.tsx`)

Add optional fields:
- `uomType?: 'numeric' | 'binary' | 'tiered' | null`
- `qualitativeOptions?: Array<{ label: string; rating: number; definition: string }> | null`

### 4. Update org-scope input in `OrgKpiEntryCard` (~lines 322-361)

When `data.uomType === 'binary' || data.uomType === 'tiered'`:
- Replace the numeric `<Input type="number">` with `<QualitativeSelect>`
- On selection, store the rating as `achievedValue` and optionally include the label in remarks
- Skip the out-of-range warning (not applicable to qualitative)

### 5. Update `EmployeeRow` and `DepartmentRow` in `OrgKpiScopedEntryTable`

For rows where `row.uomType === 'binary' || row.uomType === 'tiered'`:
- Replace the numeric `<Input type="number">` with `<QualitativeSelect>`
- The `onValueChange` callback sends the rating number as the achieved value
- Hide the "Bulk fill" numeric input when all KPIs in the table are qualitative

### 6. Update `handleScopedChange` in `OrgKpiEntryCard`

No changes needed -- it already handles `achievedValue` as a string that gets parsed to a number. The rating (0-5) from `QualitativeSelect` will flow through naturally.

## Files to Edit

| File | Change |
|------|--------|
| `src/components/admin/OrgKpiEntryCard.tsx` | Add `uomType`/`qualitativeOptions` to interface; render `QualitativeSelect` for org-scope |
| `src/components/admin/OrgKpiScopedEntryTable.tsx` | Add fields to `ScopedRow`; render `QualitativeSelect` in employee/department rows |
| `src/pages/admin/OrgKpiDataEntry.tsx` | Pass `uomType` and `qualitativeOptions` in `buildCardData` and scoped rows |

## Risk Assessment

| Aspect | Risk | Mitigation |
|--------|------|-----------|
| Data impact | None | Rating stored as number in existing `achieved_value` column |
| Regression | Very low | Numeric KPIs untouched; qualitative rendering only when `uom_type` is binary/tiered |
| UI consistency | Good | Reuses existing `QualitativeSelect` component from review module |

