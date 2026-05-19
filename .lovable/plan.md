## Remove redundant VariantScaleStrip summary

The Freq / R0–R5 / Criteria / UoM scale strip rendered above the "View KPIs" drill-in table (red box in screenshot) is now redundant — the same data is shown per-row inside `AffectedKpisTable` with outlier highlighting.

### Changes

1. **`src/components/admin/kpi-standardization/BuildRegistryTab.tsx`**
   - Remove the `<VariantScaleStrip ... />` block (lines ~429–433) rendered for each variant card.
   - Remove the now-unused `import { VariantScaleStrip } from './VariantScaleStrip';`.

2. **Delete unused files** (no other consumers):
   - `src/components/admin/kpi-standardization/VariantScaleStrip.tsx`
   - `src/components/admin/kpi-standardization/VariantScaleStrip.test.tsx`

### Out of scope / preserved
- `AffectedKpisTable` (the actual table with Freq + R0–R5 columns + "Show scale" toggle) — unchanged.
- `scan_kpi_duplicate_groups` RPC and `ScannerVariant` mixed-flag fields — left intact (cheap, no UI impact, may be reused later).
- No DB, RLS, or business logic changes.

### Risk
Purely UI removal. No regression risk to scoring, scanning, or merge logic.
