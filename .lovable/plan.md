# KPI-Employee Matrix — Usability Pass

Scope: `src/pages/reports/KpiEmployeeMatrix.tsx` only (presentation). No changes to hooks, RPCs, scoring logic, RLS, or exports' data shape.

## Problems observed (from current screenshot)

1. Employee names use vertical-rl rotated text at 10–12px — illegible at this density.
2. Left "Sr / Category / KRA / KPI / Wt% / Emp#" pane is sticky with hand-computed pixel offsets that don't match column widths, so the freeze drifts when you scroll horizontally.
3. Each cell crams `Wt%` and weighted score on two lines in 80px — both numbers compete and neither stands out.
4. Massive blank area: most employees only own ~5 of 54 KPIs, so >70% of the grid is empty cells.
5. No way to focus: no row hover highlight, no column highlight on hover, no "jump to employee" affordance.
6. Only 27 employees fit here, but Support Function scopes load 200+ employees → headers become unreadable. Need employee paging.
7. Filter bar is one long row of 8 controls — hard to scan; primary (Period/Year) buried among hierarchy filters.

## What changes (UI only)

### 1. Filter bar
- Split into 2 rows: top = **Period · Year · Search · View mode · Hide empty employees** (the dials admins touch every time). Bottom = **Company · Division · BU · Department · Category** (scope filters).
- Add a small "Active filters" chip strip with one-click clear per filter.

### 2. View mode toggle (new)
SegmentedControl (Tabs) above the table:
- **Weightage** — cell shows `Wt%` only (default).
- **Score** — cell shows weighted score only.
- **Both** — current stacked layout (kept for parity).
This kills the cramped two-line cell for the 95% case.

### 3. "Hide unmapped employees" toggle (new, on by default)
When ON, employee columns with zero mapped KPIs in the current page filter set are hidden. Counter shows `Showing X of Y employees`. Export remains on the full set so reports are unaffected.

### 4. Employee paging strip (new)
Above the grid: `‹ Employees 1–25 of 73 ›` with page-size 25/50/100. Renders only the visible window of employee columns. Sticky left pane stays put; only the right pane scrolls/changes.

### 5. Fix sticky panes
Rewrite the left freeze using a CSS-grid-style approach: explicit column widths in a constant, and `left` offsets computed from those widths so Category/KRA/KPI never drift. Same fix for sticky header row. Add a subtle right-border shadow on the last sticky column to make the freeze edge visible.

### 6. Employee column header redesign
- Drop vertical-rl text. Instead, render headers at 35° rotation in a 140px-tall header row with: full name (bold), employee code below in muted text.
- Increase header font from 12 → 13px.
- Hover on a header highlights its full column (subtle `bg-accent/30`).

### 7. Cell density & legibility
- Increase row height (h-9 → h-11), cell font-size to 13px.
- Mapped-but-unscored cells: light dotted background instead of solid grey, so the eye skips them.
- Mapped + scored: use a gentle data-bar background scaled to `score / weightage` so coverage is visible at a glance. No new business logic — just CSS width proportional to the existing numbers.
- Zebra rows (`even:bg-muted/20`).
- Row hover: highlight whole row including sticky pane.

### 8. KPI row left pane
- Collapse `Category / KRA / KPI` into a single 320px cell: KPI name bold, KRA + Category in a muted second line. Reclaims ~14rem of horizontal space for employee columns. (`Wt%` and `Emp#` stay as their own narrow columns.)
- Tooltip on hover still shows full text.

### 9. Empty / scope states
- Keep click-to-load shell. Add an inline "Refine filters" button on the >25k-cell banner that scrolls focus to the filter bar.

### 10. Pagination footer polish
- Add page-size selector (25 / 50 / 100 KPI rows). Default stays 50.
- Show "Page 1 of 2" alongside Previous/Next.

## Out of scope
- Hook/RPC changes, scoring formula, RLS, Excel structure, mobile breakpoint redesign, sort by employee score (can come later).

## Risk & Impact

| Area | Impact |
|---|---|
| Data | None — read-only presentation changes |
| Workflow | None |
| UI/UX | Significant improvement in scanability; layout shifts only on this page |
| Regression | Low; sticky-pane rewrite is the main risk → covered by snapshot/visual test |
| Scalability | Better — employee paging caps DOM nodes to ~50 cols × 50 rows = 2,500 cells regardless of scope |
| Rollback | Trivial — single file, revert commit |

## Verification

1. Vitest: extend `useKpiEmployeeMatrix` tests with a small render test that asserts (a) hide-unmapped removes zero-KPI columns, (b) view-mode toggle renders only the chosen number, (c) employee paging slices columns correctly.
2. Manual: load `Commercial-Plant Accounts / April 2026` (current screenshot scope) — left pane stays frozen at every horizontal scroll position, headers readable without head-tilt, default Weightage view fits ~15 employees on screen at 1080p without zoom.
3. Manual: switch to `Support Function` (large scope, post-load) — employee paging caps render; FPS stays smooth.
4. Excel export byte-for-byte identical to current output (full employee set, no view-mode filtering).

## Docs / Memory updates
- `DOCUMENTATION.md` → KPI-Employee Matrix section: list view modes, hide-unmapped, employee paging.
- `mem/features/reports/kpi-employee-matrix-report.md` → add UX policy: "Default to Weightage view; hide unmapped employees by default; export always uses full employee set."

Awaiting approval to implement.
