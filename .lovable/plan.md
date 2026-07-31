# Heat Map cell drill-down — expand employees under the clicked band

## What the user gets

In the Bell Curve Analysis Heat Map, clicking any band cell (e.g. FAD x 8%, or Admin x Exceeds Expectations (4)) expands a panel **directly under that row** listing every employee counted in that cell. Clicking the same cell again collapses it. Works identically in both band modes — Slab % and Rating bands (1–5) — because the drill-down uses the same banding engine that produces the cell counts.

### Expanded panel contents
- Header: `Business Unit · 8% (3.00 – under 3.50) — 43 employees`, with a small close (X) button.
- A compact table, one row per employee:
  - Employee code, Name, Department/Grade, Manager, Final Score (/100), Final Rating (/5), Slab %.
- Sorted by rating, highest first; search box for name/code.
- Paginated at 25 rows per page (counts here reach 250+), with a per-panel "Export CSV" of exactly the listed employees.
- Empty cells (count 0) are not clickable.

### Interaction rules
- Only one cell is expanded at a time; opening another closes the previous one.
- Cell expansion is independent of the existing checkbox multi-select — selecting rows to scope the charts still works, but clicking a *cell* no longer toggles row selection (selection stays on the checkbox and the name cell).
- Switching band mode, grouping view (Department / BU / Division / Manager), or any filter closes the expanded cell.

## Technical notes

- `src/lib/annualReview/bellCurve.ts`: add a pure helper `employeesInBand(rows, groupKey, groupId, banding, bandKey)` reusing `ratedRows` + `banding.keyOf`, so the drill-down list matches the heat map count exactly (same rated/excluded filter, same bucket boundaries). No change to existing exports.
- `RatingHeatmap.tsx`: cells become buttons carrying `(rowId, bandKey)`; local `expanded` state; renders an extra `<tr>` with a full-width `<td colSpan>` immediately after the expanded row. New optional prop `renderDrilldown?(rowId, bandKey) => ReactNode` keeps the heat map presentation-only.
- New `src/components/reports/annual-review/bellCurve/BandEmployeeList.tsx`: search + sort + client pagination (25/page) + CSV export, reading the already-fetched comprehensive rows — no new network calls.
- `BellCurveTab.tsx`: passes `renderDrilldown` wired to `employeesInBand(filtered, view, …)` and resets expansion on view/mode/filter change.
- Per-employee rating (/5) and slab % come from the ADR-212 SSOT `src/lib/annualReview/ratingSlab.ts` — no hardcoded percentages.

## Risk & impact

- Data: none — read-only over the dataset already loaded by the tab. No schema, RLS, or RPC change.
- Workflow/permissions: none; the panel shows only rows the report RPC already returned (manager scope filter still applies).
- Performance: the drill-down is computed lazily for the clicked cell only and paginated, so large cells (250+) don't stall rendering.
- Regression: heat map cell click previously toggled row selection — that moves to the checkbox/name cell, called out above as intentional.
- Rollback: pure frontend; revert the three files plus the helper.

## Verification

- Unit tests for `employeesInBand`: count parity with `heatmapBands` cells in both modes, boundary rating (exactly 3.50 lands in the higher slab), unrated/excluded rows omitted, unknown group id returns empty.
- Docs: ADR-218c addendum, POLICY §AR-BELL-CURVE item 11, DOCUMENTATION.md version bump, memory note update.