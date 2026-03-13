
# CAPA: Impact Preview for All Severities + Bigger KPI Editor — IMPLEMENTED ✅

## Changes Made

### 1. `src/components/admin/ScoringHealthCheck.tsx`
- Added `Eye` icon import and `onImpactPreview` handler for read-only impact preview
- Added `impactReadOnly` state; set to `true` for preview, `false` for fix
- Added "Impact" button (Eye icon) to every issue row across all severity tabs
- Passed `readOnly` prop to `ScoringFixImpactDialog`

### 2. `src/components/admin/ScoringFixImpactDialog.tsx`
- Added `readOnly` prop (default `false`)
- When `readOnly = true`: hides checkboxes, simulated score/change columns, apply button, and summary badges
- Shows only Month, Year, Achieved Value, Current Score in read-only mode
- Footer shows "Close" instead of "Cancel"

### 3. `src/components/admin/AdminKpiEditDialog.tsx`
- Changed dialog width from `max-w-3xl` → `max-w-5xl`

## Impact
- No schema changes, no RLS changes
- All existing fix functionality preserved; new read-only mode is additive
