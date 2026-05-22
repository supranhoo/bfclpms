## Goal
Address the two concrete usability complaints on `/reports/kpi-employee-matrix`:
1. **KPI/KRA left column eats too much horizontal space** — shrink it the same way the dashboard does (single tight column, expand on demand).
2. **KPI labels must remain visible while scrolling employees** — already sticky horizontally, but make the freeze rock-solid and add vertical sticky behavior so KPI rows stay anchored when scrolling long employee lists.

Presentation-only changes inside `src/pages/reports/KpiEmployeeMatrix.tsx`. No hooks, RPCs, scoring, RLS, or export changes.

## Why no visual ritual
The redesign skill expects palette/type/layout choices. This is a data-grid density problem, not a brand/mood one. Running the ritual here would burn three questions without changing the outcome. If you want a fresh visual identity for the reports surface separately, say the word and I'll run the full ritual on the Reports Hub.

## Risk & Impact
- **Data**: none.
- **Workflow**: none.
- **UI/UX**: left pane shrinks ~50%; sticky behavior tightened.
- **Regression**: low — confined to one file's render layer.
- **Mitigation**: keep `COL` constants as single source of truth for sticky offsets; verify on Commercial-Plant Accounts (small) + Support Function (large) + Safety & Health (medium) scopes.

## Layout Changes

### 1. Compact KPI/KRA column (dashboard parity)
Current: 280px column with KPI name + KRA subtitle + Wt inline.

Target: **180px** column, single line, dashboard-style.
- KPI name only, bold, single-line truncate.
- Hover → existing tooltip already shows KRA + Category + Weightage (no info lost).
- Optional row-level expand: a tiny chevron toggles a second muted line showing KRA · Wt%. State held in `expandedRows: Set<string>` so admins who want both views can opt in per row. Bulk "Expand all" toggle next to the view-mode switch.
- Result: left pane drops from `44+280 = 324px` to `44+180 = 224px` → reclaims **100px** for employee columns (~1.5 extra employees visible at 64px cell width).

### 2. Rock-solid sticky behavior
Current behavior: KPI column is `position: sticky; left: STICKY_KPI_LEFT`. Header row is `sticky top-0`.

Tightening:
- Add a real right-edge shadow on the sticky KPI column (`shadow-[2px_0_0_0_hsl(var(--border))]` already there — promote to `shadow-[4px_0_8px_-4px_hsl(var(--foreground)/0.08)]`) so the freeze line is obvious during horizontal scroll.
- Add `z-index` discipline: sticky-thead `z-30`, sticky-left-pane body cells `z-20`, intersection (Sr + KPI header cells) `z-40`. Fixes the rare flicker where a body cell paints over the header during fast scroll.
- Category group rows already render `colSpan`; mark them `sticky left-0` with `z-20` so the category label stays visible during horizontal scroll (right now it scrolls off).
- Verify on Safari/Firefox — sticky inside `overflow-auto` requires the table cells, not the table itself, to carry `position: sticky`. Current implementation is correct; keep it.

### 3. Sticky KPI rows during vertical scroll (in-category anchor)
"KPI should be visible on screen" reading: when the admin scrolls vertically through 40+ KPIs, the **category band** for the current group should stick to the top of the scroll container (below the employee header). Same pattern dashboard uses for section headers.

Implementation:
- Category band row gets `position: sticky; top: COL.headerH` and `z-25`.
- When the next category band scrolls up, it pushes the previous one out — standard sticky stacking.
- No JS scroll listeners needed; pure CSS.

### 4. Density polish (small, deterministic)
- Row height: keep `h-9` (36px).
- KPI column padding: `px-2.5` (was `px-3`).
- Score cell font: `text-[12px]` stays; numbers `tabular-nums` for column alignment.

## Out of Scope
- Pivoting the matrix (employees as rows, KPIs as columns) — different report.
- Hook/RPC/Excel changes.
- New filters or scoring tweaks.

## Implementation Steps
1. Update `COL.kpi` from 280 → 180.
2. Strip KRA subtitle + Wt inline from KPI cell; keep tooltip as the disclosure path. Add per-row chevron + `expandedRows` state for opt-in second line.
3. Promote sticky shadows and re-layer `z-index` for thead/tbody sticky cells.
4. Make category band `sticky top-{COL.headerH} left-0 z-25`.
5. Add `tabular-nums` to score cells.
6. Type-check; spot-check three scopes against the 1681×1080 viewport you're on.

## Verification
- Commercial-Plant Accounts / April 2026 → 15 employees, all on screen, no horizontal scroll.
- Safety & Health / April 2026 → ~12 employees, category band sticks while scrolling KPIs.
- Support Function / April 2026 → 50 employees per page, horizontal scroll smooth, KPI column never drifts.

## Docs
- Update `mem/features/reports/kpi-employee-matrix-report.md`: new `COL.kpi = 180`, expand-on-demand pattern, sticky category bands.
- Append entry to `DOCUMENTATION.md` Version History.
