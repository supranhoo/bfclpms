

## Simplify KRA Library Search: KPI-Only Selection

### Change
Remove the checkbox/select option from Category and KRA rows in the search panel. Only KPI rows should be selectable. When a KPI is selected, the system auto-fills Category, KRA, KPI name, and all structural fields (which it already does).

### Implementation

**File 1: `src/components/admin/KraLibrarySearchPanel.tsx`**
1. Remove `onSelectCategory` and `onSelectKra` from props interface
2. Remove `Checkbox` from Category rows — keep them as expand/collapse only
3. Remove `Checkbox` from KRA rows — keep them as expand/collapse only
4. Keep `Checkbox` + "Apply" button on KPI rows as-is
5. Remove `handleSelectCategory` and `handleSelectKra` functions
6. Remove the `cat-` and `kra-` prefixed selectedId tracking (only `kpi-` needed)

**File 2: `src/components/admin/AdminKpiCreateDialog.tsx`**
1. Remove `onSelectCategory` and `onSelectKra` handler props from `<KraLibrarySearchPanel>`
2. Keep `onSelectKpi` handler unchanged — it already fills everything (category, KRA, KPI, targets, thresholds, etc.)

**File 3: `DOCUMENTATION.md` / `POLICY.md`** — Version history update

### Risk Assessment
- **Data Impact**: None
- **Regression Risk**: Zero — removing unused selection paths; KPI selection (the working path) is untouched

