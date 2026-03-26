

## Enlarge KRA Issuance Confirmation Dialog + Add Edit KPI Button

### Problem
The dialog is already `max-w-5xl` but feels constrained. User wants more space and an "Edit KPI" option using the existing Admin KPI Editor.

### Changes — 1 file: `src/components/admin/KraIssuanceConfirmDialog.tsx`

1. **Increase dialog size**: Change `max-w-5xl` → `max-w-7xl` (1280px) to give more room for the 9-column table
2. **Add Edit button per row**: Add a new "Actions" column with a pencil icon button that opens the `AdminKpiEditDialog` for the selected KPI
3. **Wire AdminKpiEditDialog**: 
   - Import `AdminKpiEditDialog` and the `KPI` type
   - Add state for `editingKpi` (the KPI to edit)
   - When edit button clicked, fetch full KPI data and open the editor
   - On editor close, invalidate queries to refresh the table
4. **Fetch full KPI objects**: The current query only selects limited fields. Add a secondary fetch (or expand the select) to get the full KPI record when editing, since `AdminKpiEditDialog` expects a full `KPI` object

### Table Layout After Change

| ✓ | # | Category | KRA | KPI | UOM | Target | Weightage | Frequency | Actions |
|---|---|----------|-----|-----|-----|--------|-----------|-----------|---------|

The Actions column will contain a small pencil icon button per row.

### Files Changed
1. **`src/components/admin/KraIssuanceConfirmDialog.tsx`** — Widen to `max-w-7xl`, add Actions column with Edit KPI button, integrate `AdminKpiEditDialog`

