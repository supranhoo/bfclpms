

# Plan: Add Edit KPI, Add Weightage to Empty Cells, and Remove Weightage on Weightage Matrix

## Problem
The KPI Weightage Dashboard currently only allows editing weightage values for cells that have existing KPI records. The user wants three capabilities:
1. **Edit KPI** — Open the full Admin KPI Edit dialog from the matrix
2. **Add weightage to "--" cells** — Empty cells (no KPI record for that month) should allow adding weightage
3. **Remove KPI weightage** — Clear weightage from a cell (set to null/0)

## Changes

### 1. `src/pages/admin/KpiWeightageDashboard.tsx`

**Add Edit KPI button**: Import `AdminKpiEditDialog`. Add state for `editingKpiId`. When a KPI row is right-clicked or via a small edit icon in the KPI name cell, fetch the full KPI record and open the edit dialog.

- Add state: `editingKpi` (KPI | null)
- Add a small pencil/edit icon button in the KPI name cell (sticky left column) that fetches the KPI by ID (using the first available `kpiIds[month]`) and opens `AdminKpiEditDialog`
- Render `<AdminKpiEditDialog>` at the bottom of the component

**Make "--" cells clickable**: Currently, cells without a `kpiId` for that month show plain "--" text. Update these cells to show a "+" button on hover that creates a new KPI record for that month by duplicating from an existing month's KPI data, then opens the weightage editor.

- For "--" cells where the KPI exists in other months (i.e., `Object.keys(kpiIds).length > 0`), show an interactive "+" button
- On click, duplicate the KPI from the nearest existing month into the target month (insert into `kpis` table with the new `review_period` and `review_year`), then refresh the matrix

**Remove weightage**: The existing `WeightageCellEditor` already supports setting weightage to empty/null (clearing the input and saving). This is feature #3 — no additional changes needed. Just ensure the UI hint is clear.

### 2. `src/components/admin/WeightageCellEditor.tsx`

- Add a "Remove Weightage" quick action button below the input that sets value to empty string and saves with scope "this" — providing a one-click way to clear weightage

### Summary
- `src/pages/admin/KpiWeightageDashboard.tsx` — Add Edit KPI dialog integration + clickable "--" cells for adding KPIs to missing months
- `src/components/admin/WeightageCellEditor.tsx` — Add "Remove" quick action button

No database changes needed.

