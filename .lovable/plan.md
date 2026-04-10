

## RCA: Binary/Tiered KPI Display Issues in Target & Achieved Columns

### Root Cause Analysis

**Issue 1 — Target shows raw numeric value for Binary/Tiered KPIs**
- **Location**: `KpiDetailsTable.tsx:538` and `MobileKpiCard.tsx:314`
- **Cause**: Code renders `kpi.target_value ?? '-'` directly. For binary KPIs, `target_value` is typically `null` (shows "—") or `0` (shows "0 Number"). Neither conveys meaning.
- **Expected**: For Binary/Tiered KPIs, the "Target" should display the **Rating 5 label** from `qualitative_options` (e.g., "No" for a safety KPI where No non-compliance = Rating 5).
- **DB evidence**: The KPI `1e4998ef` has `target_value: null`, `uom_type: binary`, `qualitative_options: [{label: "Yes", rating: 0}, {label: "No", rating: 5}]`. Target should show **"No"** (the R5 option).

**Issue 2 — Achieved shows raw rating number instead of label**
- **Location**: `KpiDetailsTable.tsx:551-558`
- **Cause**: Code renders `achievedVal` (a number like `5`) with the UOM suffix (e.g., "5 Number"). For Binary/Tiered KPIs, `achieved_value` stores the **rating score** (0-5), not a measured quantity.
- **Expected**: Should resolve the numeric rating back to the qualitative label (e.g., `5` → "No" for inverted binary).
- **DB evidence**: KPI `855f4a7f` has `achieved_value: 5`, `qualitative_options: [{label: "Yes", rating: 0}, {label: "No", rating: 5}]`. Achieved should show **"No"** not "5 Number".

**Issue 3 — Achieved data present but Self score blank**
- **DB evidence**: Query confirms **zero** cases of `achieved_value IS NOT NULL AND self_score IS NULL` for binary/tiered KPIs in 2026 data. This is likely a visual observation caused by Org KPI propagation showing an achieved value in the Achieved column while the employee hasn't yet submitted a self-review. Not a data bug — but worth adding a visual indicator to clarify Org KPI source.

### Plan

**1. Create utility function** `getQualitativeDisplayLabel` in `src/lib/qualitativeUom.ts`
- Input: rating number, uom_type, qualitative_options
- Output: the matching label string or fallback to the number
- Reusable across all components

**2. Update `src/components/review/KpiDetailsTable.tsx`**

Target column (line ~537):
- If `uom_type` is `binary` or `tiered`: find the option with the **highest rating** (Rating 5) from `qualitative_options` (or `BINARY_OPTIONS` fallback) and display its label
- Otherwise: keep current `target_value` display

Achieved column (line ~549):
- If `uom_type` is `binary` or `tiered` and `achievedVal` is a number: look up the matching label from `qualitative_options` using the new utility
- Otherwise: keep current numeric display

**3. Update `src/components/review/MobileKpiCard.tsx`**
- Apply same Target display logic (line ~314)

**4. Update `DOCUMENTATION.md` / `POLICY.md`** — version bump

### Risk Assessment
- **Data Impact**: None — display-only changes, no schema or data modifications
- **Regression Risk**: Low — changes are scoped to display rendering for specific UOM types with clear fallback to existing behavior
- **UI Consistency**: Improves clarity by showing human-readable labels instead of raw numbers

