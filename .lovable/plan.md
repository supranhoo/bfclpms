

## RCA: Quick Search Library Selection Not Auto-Filling All Fields

### Root Cause

The issue is in the **callback handlers** in `AdminKpiCreateDialog.tsx` (lines 345-406):

| Selection Level | What Gets Filled | What's Missing |
|---|---|---|
| **Category** (line 345-349) | `categoryId` only | KRA name, KPI name, all metrics (UOM, target, thresholds, etc.) |
| **KRA** (line 350-354) | `categoryId` + `kraName` | KPI name, all metrics |
| **KPI** (line 355-406) | Everything | Nothing — works correctly |

When admin selects a **Category** or **KRA** from search results, the handler only sets identity fields but does NOT look up the first available KPI under that selection to auto-fill metrics. The full auto-fill logic (UOM, target, thresholds, frequency, weightage, etc.) only exists in the `onSelectKpi` handler.

### Fix — `AdminKpiCreateDialog.tsx`

**`onSelectKra` handler (lines 350-354)**: After setting `categoryId` + `kraName`, find the first matching template (or existing KPI) for that category+KRA combo and auto-fill: KPI name, UOM, UOM type, criteria, target, weightage, frequency, thresholds (R0-R5), qualitative options, threshold mode, source of data, and resubmit reason.

**`onSelectCategory` handler (lines 345-349)**: After setting `categoryId`, find the first matching template (or existing KPI) for that category and auto-fill: KRA name, KPI name, and all metric fields listed above.

Both handlers will reuse the exact same field-mapping logic already present in `onSelectKpi` (lines 363-404), extracted into a helper function to avoid duplication.

### Implementation Detail

Create a local `applyEntryFields(source)` function that takes a template or KPI record and calls all the setters (setUomType, setUom, setCriteria, setTargetValue, setWeightage, setFrequency, setR5-R0, etc.). All three handlers call this function after finding the best match:
- `onSelectKpi`: exact match (existing behavior)
- `onSelectKra`: first template/KPI matching `category_id + kra_name`
- `onSelectCategory`: first template/KPI matching `category_id`

### Risk Assessment
- **Data Impact**: None — read-only lookup, no schema changes
- **Workflow Impact**: None — additive improvement to existing auto-fill
- **Regression Risk**: Zero — extracting existing logic into a helper; `onSelectKpi` behavior unchanged

### Files Changed
1. **`src/components/admin/AdminKpiCreateDialog.tsx`** — Extract field-mapping helper; update `onSelectCategory` and `onSelectKra` handlers to auto-fill all fields from first matching entry

