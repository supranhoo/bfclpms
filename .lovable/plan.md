

# Plan: Support Inverted Binary KPIs (No = 5, Yes = 0)

## Problem
Binary KPIs are hardcoded to **Yes = 5, No = 0** everywhere. For safety KPIs like LTI (Lost Time Injury), "No" (no injury) means good performance and should score 5, while "Yes" (injury occurred) should score 0. The screenshot confirms this issue — the HR PMS scorer sees "No" mapped to R0 when it should be R5.

## Solution
Add a **polarity toggle** in the admin KPI edit dialog for binary KPIs: "Standard (Yes=5)" vs "Inverted (No=5)". When inverted, save swapped `qualitative_options` on the KPI record. The existing fallback pattern (`qualitative_options ?? BINARY_OPTIONS`) already works in most components — but several places hardcode binary options and must be fixed.

## Changes

### 1. `src/lib/qualitativeUom.ts`
- Add `BINARY_OPTIONS_INVERTED` constant: `[{label:'Yes', rating:0}, {label:'No', rating:5}]`
- Add helper `getBinaryOptions(qualitativeOptions)` that returns stored options or default `BINARY_OPTIONS`

### 2. `src/components/admin/AdminKpiEditDialog.tsx`
- Replace the static "Yes=R5, No=R0" info box with a polarity toggle (Switch or RadioGroup)
- When inverted is selected, set `formData.qualitative_options` to inverted values
- On save, persist `qualitative_options` for binary KPIs (currently only saved for tiered)

### 3. `src/components/admin/TemplateFormDialog.tsx`
- Same polarity toggle for template creation
- Save the correct `qualitative_options` based on polarity selection

### 4. Fix hardcoded binary fallbacks (3 files)
These places ignore `qualitative_options` for binary KPIs and must use the stored options:

| File | Issue |
|------|-------|
| `AdminDataEntryDialog.tsx` (line 313-314) | Hardcodes `Yes=5, No=0` instead of checking `kpi.qualitative_options` |
| `SelfReviewSheet.tsx` (line 274-275) | Same hardcoded fallback |
| `TemplateFormDialog.tsx` (line 156-158) | Always saves default `BINARY_OPTIONS` |

Fix pattern: Replace `kpi.uom_type === 'binary' ? [{label:'Yes',rating:5},...] : ...` with `kpi.uom_type === 'binary' ? (kpi.qualitative_options?.length ? kpi.qualitative_options : BINARY_OPTIONS) : ...`

### 5. No database changes needed
`qualitative_options` (JSONB) column already exists on `kpis` table and supports storing custom binary options.

## Summary of Touch Points
- 5 files modified, 0 new files, 0 database migrations
- Existing KPIs unaffected (default remains Yes=5, No=0)
- All review stages (Self, Manager, Skip-Level, HR PMS, Audit, Management) automatically respect stored `qualitative_options` via `QualitativeSelect` and `QualitativeValueInput` components

