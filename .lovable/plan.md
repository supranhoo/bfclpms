

# Fix: Binary KPIs Showing Numeric Input Instead of Yes/No Options (v1.46.26)

## Root Cause

The "Total Recordable Injury (LTI)" KPI has `uom_type = 'binary'` in the database, but most employee records have `qualitative_options = NULL`. The UI condition that decides whether to show a qualitative dropdown vs a numeric input is:

```
(row.uomType === 'binary' || row.uomType === 'tiered') && row.qualitativeOptions?.length
```

Since `qualitativeOptions` is null, the second half fails, and it falls through to a numeric text input -- even though `uom_type` is clearly `'binary'`.

The system already has a `BINARY_OPTIONS` constant (Yes=5 / No=0) designed as a fallback, but the display condition doesn't account for this fallback.

## Solution

Update the display condition in **both** the `OrgKpiScopedEntryTable` (Employee/Department rows) and `OrgKpiEntryCard` (Org-wide scope) to treat `uom_type === 'binary'` as sufficient to show the qualitative selector, falling back to `BINARY_OPTIONS` when `qualitativeOptions` is null/empty.

## Changes

### 1. `src/components/admin/OrgKpiScopedEntryTable.tsx` -- EmployeeRow component

**Current condition** (line ~281):
```typescript
(row.uomType === 'binary' || row.uomType === 'tiered') && row.qualitativeOptions?.length
```

**New condition**:
```typescript
row.uomType === 'binary' || (row.uomType === 'tiered' && row.qualitativeOptions?.length)
```

For binary KPIs, always show the qualitative selector. The `QualitativeSelect` component already handles the fallback to `BINARY_OPTIONS` internally when `qualitativeOptions` is null.

Apply the same fix to the DepartmentRow component (line ~397).

Also update the `allQualitative` check (line ~55) used to hide the bulk-fill numeric input for qualitative KPIs.

### 2. `src/components/admin/OrgKpiEntryCard.tsx` -- Org-scope input

**Current condition** (line ~329):
```typescript
(data.uomType === 'binary' || data.uomType === 'tiered') && data.qualitativeOptions?.length
```

**New condition**:
```typescript
data.uomType === 'binary' || (data.uomType === 'tiered' && data.qualitativeOptions?.length)
```

### 3. No database changes needed

The data is correct (`uom_type = 'binary'`). The issue is purely a UI display condition.

## Risk Assessment

| Aspect | Risk | Mitigation |
|--------|------|-----------|
| Data impact | None | Read-only display fix |
| Regression | Low | Only changes which input widget is shown; `QualitativeSelect` already handles `BINARY_OPTIONS` fallback |
| Scope | 2 files, ~4 line changes | Minimal surface area |
