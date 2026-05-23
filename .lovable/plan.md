## Goal
Reclaim the ~180px of vertical space currently burned by the title row, toolbar card, preview-counters row, and the Matrix card header on `/review/bulk-scoring`. Target: top chrome ≤ 56px so the matrix starts almost immediately under the page top.

## What's wasting space today (from your screenshot)
1. **Title row** — full 40px row holding only "Bulk Review Dashboard" + Beta badge.
2. **Toolbar card** — `Card` + `CardContent py-3 space-y-3` = ~96px for one row of controls + a counters strip.
3. **Counters strip** — `27 employees · 269 KPIs · ~21 KB payload` sits on its own row inside the card.
4. **Refresh button** — lives in the title row, far from where it's used.
5. **Review Matrix card header** — another ~56px for the title + page badge + row/total/variance stats.
6. **Outer paddings** — `p-3 md:p-4` + `space-y-4` between every block.

## Redesign — single sticky utility bar

Collapse the three separate strips (title, toolbar, matrix-card-header) into **one** sticky utility bar at the very top of the page. Everything the user needs to operate the matrix lives in that bar; the matrix itself starts right below it with no intermediate card chrome.

```text
┌─────────────────────────────────────────────────────────────────────────────────────┐
│ ☰ Bulk Review · Beta │ 🔍 Search…  │ Wt|Score|Both │ 👁 │ Stage▾ │ ⛃ Filters (1)│Load│  ← row 1, h-12
│ 27 emp · 269 KPI · 21KB  •  Page 1/2 · 200/269 rows · Δ>1: 4         │ ↻ Refresh   │  ← row 2, h-7 muted
└─────────────────────────────────────────────────────────────────────────────────────┘
[ Matrix grid starts here — no card wrapper, viewport = 100vh - 80px ]
```

### Concrete changes (presentation only, scoped to `BulkReviewDashboard.tsx`)

1. **Delete the standalone title `<div>` (lines 252–269).** Inline a tighter title (`Layers` icon + `Bulk Review · Beta`) as the left-most chip inside the utility bar.
2. **Replace the toolbar `<Card>` (lines 272–453) with a plain sticky `<div>`:**
   - `sticky top-0 z-30 bg-background/95 backdrop-blur border-b`
   - Inner: `flex items-center gap-2 h-12 px-3` for row 1 (title + search + toggles + stage + filters + Load + Refresh).
   - Drop `CardContent py-3 space-y-3` — no card padding overhead.
3. **Demote the counters row to a single h-7 muted strip below row 1**, merging preview counters + matrix stats (`27 emp · 269 KPI · ~21 KB · Page 1/2 · 200 rows · Δ>1: 4`). Replaces both the toolbar counters (lines 436–451) and the Matrix `CardHeader` (lines 472–484). Cap-exceeded badge moves inline here.
4. **Move Refresh into row 1** (right edge, icon-only `size="icon"`), removing it from the deleted title row.
5. **Unwrap the matrix from its `<Card>` (lines 471–535)** — render `BulkReviewMatrixGrid` directly inside the page, with the pagination strip directly under it. The grid keeps its own internal sticky header; no outer card chrome.
6. **Tighten outer paddings:** page wrapper `p-2 md:p-3 space-y-2` (was `p-3 md:p-4 space-y-4`).
7. **Bump matrix viewport height** in `BulkReviewMatrixGrid.tsx` from `max-h-[calc(100vh-260px)]` to `max-h-[calc(100vh-110px)]` to absorb the freed vertical space.
8. **Empty state** keeps its card (it's a hero block, not chrome) but moves directly under the utility bar.

### What does NOT change
- All filter logic, scope preview, snapshot fetch, write paths, RLS, RPCs, flag gating — untouched.
- Filters popover internals unchanged.
- Selection toolbar (`sticky bottom-4`) unchanged.
- Drawer unchanged.
- No new dependencies, no design-token changes (sticky bar uses existing `bg-background` + `border-b`).

## Risk & Impact
- **Data / RLS / policy:** none.
- **Workflow:** none.
- **UI/UX:** ~110px vertical reclaimed above the matrix; sticky utility bar keeps controls reachable while scrolling. Refresh moves to the right edge of row 1 (still discoverable).
- **Responsiveness:** row 1 uses `flex-wrap`; on narrow widths the title chip + Load button stay anchored, middle controls wrap to a second line — net result is never worse than today.
- **Regression risk:** very low; purely structural JSX/CSS refactor of one page + a one-line height change in the grid.
- **Rollback:** revert two files.

## Files touched
- `src/pages/review/BulkReviewDashboard.tsx` — collapse title + toolbar card + matrix-card-header into one sticky utility bar; unwrap matrix card; tighten paddings.
- `src/components/review/BulkReviewMatrixGrid.tsx` — bump `max-h` to `calc(100vh-110px)`.

## Out of scope
- No RPC, schema, or policy changes.
- No new filters or business logic.
- No virtualization work (already shipped in Phase 2 polish).
- No changes to other review pages.
