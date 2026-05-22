## Goal
Make the KPI–Employee Weighted Score Matrix readable on a standard 1080p/1440p screen without zoom-out, while preserving all scoring data and the existing hooks/RPCs/RLS.

## Scope
Presentation-only changes in `src/pages/reports/KpiEmployeeMatrix.tsx`. No hook, RPC, export, or scoring logic changes.

## Risk & Impact
- **Data**: None. Wt% removed from UI only; export keeps full data.
- **Workflow**: None.
- **UI/UX**: Major visual change to the matrix grid.
- **Regression**: Low — file is self-contained; sticky-pane refactor is the only risky bit.
- **Mitigation**: Keep the existing `COL` constants pattern; verify with Commercial-Plant Accounts (small) + Support Function (large) scopes.

## Layout Strategy

### 1. Remove dead weight
- Drop the **Wt%** sticky column entirely (header, body cell, offset math).
- Drop the **Emp#** (KPI coverage count) sticky column — low-value, reclaims ~48px.
- Employee headers show **name only** (no employee code line).
- Result: left pane shrinks from `44+320+56+48 = 468px` to `44+280 = 324px` → ~144px reclaimed for KPI columns.

### 2. Cell density tuned for fit
- Cell column width: **64px** (was 72px). At 1793px viewport with 324px sticky pane: `(1793-324)/64 ≈ 22` employees on screen without scroll. Most scopes (Plant Accounts ~15, Safety ~12) fit fully.
- Row height: `h-9` (36px). Header rotation **-35°** in a 130px header band.
- Body font: `text-[12px]`, header text `text-[11px] font-medium`.
- Cell content rule (since Wt% column is gone):
  - **Score view (default)**: show only the weighted score, blank if unscored.
  - **Weightage view**: show only Wt% per cell.
  - **Both view**: stacked score/Wt% (kept for power users via the toggle).

### 3. Sticky & grouping
- Sticky table head (KPI column headers stay on vertical scroll).
- Sticky left pane: Sr + KPI/KRA/Category merged cell (280px).
- **Category grouping**: render a full-width muted band row between category changes (e.g. "Safety & Health · 12 KPIs") with a small chevron to collapse the category. State held in `collapsedCategories: Set<string>`.
- Subtle zebra striping (`even:bg-muted/30`) and row hover that also highlights the hovered employee column.

### 4. Readability without clutter
- KPI cell in left pane: KPI name bold (1 line, truncate w/ tooltip), KRA muted small below. Category moves to the group band (no longer per row).
- Data bars: keep the proportional background fill in score cells (score/weightage) — already provides at-a-glance color cue.
- Score color coding (accessible, minimal): cells with ratio ≥ 0.8 → soft green tint; 0.4–0.8 → neutral; < 0.4 → soft amber tint. Uses semantic tokens (`bg-emerald-500/10`, `bg-amber-500/10`).
- Hover tooltip on each score cell shows: KPI · Employee · Wt% · Weighted Score · Raw Score — so Wt% remains discoverable without taking column space.

### 5. Header band
- Employee headers in a single 130px rotated band, name only (`text-[11px]`, two-line truncate at ~16 chars). Tooltip on hover shows full name + department.
- Column hover highlights the full vertical strip.

### 6. Pagination + filters (kept)
- Employee paging strip and dual-row filter bar from current implementation kept as-is.
- Default page size raised to **50** (still well within DOM budget thanks to narrower cells and removed columns).

## Layout sketch
```text
┌─Filters (2 rows)─────────────────────────────────────────────────────────┐
├─Scope cards │ Employee pager │ View toggle │ Export──────────────────────┤
├──────────┬────────────────────────────────────────────────────────────┐
│ Sr │ KPI │  E1   E2   E3   E4 … (rotated -35°, name only, 130px)     │
│────┼─────┼────────────────────────────────────────────────────────────│
│ ▼ Safety & Health · 12 KPIs                            (group band)   │
│ 1  │ KPI │  85   ··   72   ··                                          │
│ 2  │ KPI │  ··   60   ··   90                                          │
│ ▼ Compliance · 8 KPIs                                                  │
│ 3  │ KPI │  …                                                          │
└──────────┴────────────────────────────────────────────────────────────┘
```

## Implementation Steps
1. Update `COL` constants: remove `wt` and `emp`; set `cell: 64`, `kpi: 280`.
2. Strip Wt%/Emp# from `<thead>` and `<tbody>` rendering; recompute sticky `left` offsets.
3. Replace employee header content with name-only + tooltip.
4. Insert category group rows in the row map; add `collapsedCategories` state + toggle.
5. Add score color tinting helper (`tintForRatio`) using semantic tokens.
6. Wrap each score cell in `<Tooltip>` exposing Wt% + raw + weighted score.
7. Bump default page size to 50; verify pager math.
8. Quick type-check; spot-check Commercial-Plant Accounts (April 2026) and Support Function scopes.

## Out of Scope
Hooks, RPCs, RLS, scoring formulas, Excel export, mobile redesign.

## Docs
- Update `mem/features/reports/kpi-employee-matrix-report.md` with the new layout contract (no Wt% column, name-only headers, category grouping, score tinting thresholds, default page size 50).
- Append entry to `DOCUMENTATION.md` Version History.
- Note in `POLICY.md` §114 #6: "Matrix reports MUST surface Wt% via tooltip/secondary view, not a dedicated column, to preserve horizontal density."
