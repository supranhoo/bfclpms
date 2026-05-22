## Problem

Current screenshot shows KPI name + description rendering as a single long line that visually bleeds across the employee score columns. Root cause: the sticky KPI `<td>` has a column width of 256px but no width constraint on its inner content, so `truncate` has no effective max-width and the row content overflows the frozen pane. Comparison reference (the earlier dashboard-style screenshot, image-951) wraps the KPI/description across multiple lines inside a fixed-width cell — that's what the user means by "fix the width just like dashboard".

## Fix (presentation only)

Single file: `src/pages/reports/KpiEmployeeMatrix.tsx`.

1. **Widen the frozen KPI column** from `COL.kpi = 256` → `COL.kpi = 360` (matches the dashboard reference: comfortable two-line wrap for KPI name and one-to-two-line description).
2. **Constrain the inner content to that width**: wrap the cell contents in `<div style={{ width: COL.kpi }}>` so flex/text children honor the column width even though `<td>` width is enforced via `<colgroup>`.
3. **Switch from truncate → wrap with line clamp**:
   - KPI name: `line-clamp-2` (allows up to 2 lines, no horizontal overflow).
   - Description: `line-clamp-2 whitespace-normal break-words`.
4. **Row height becomes auto** (drop the fixed `height: COL.rowH` on KPI rows so wrapped content has room). Score cells already center vertically — they will follow the taller row naturally.
5. **KRA sub-band**: keep one-line, but add `truncate` with the same `width: COL.kpi + COL.sr` wrapper so long KRA names don't break the band.
6. **Tooltip**: unchanged — still carries full KPI, KRA, category, weightage, description.

## Out of scope

Hook, RPC, RLS, scoring, Excel export, mobile redesign. No new state.

## Verification

1. `bunx tsc --noEmit` clean.
2. Preview `/reports/kpi-employee-matrix` at 1493px viewport — confirm KPI text wraps inside the frozen pane and does not bleed over employee columns; KRA sub-band stays one line; horizontal scroll still works for employees.
3. Spot check rows with very long KPI names (e.g. "Timeliness of Production Entry Recording & Stock Reconciliation").
