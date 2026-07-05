## Problem

The Annual Review Admin tab bar broke visually after adding the 8th "System KPIs" tab:

- `TabsList` uses `grid grid-cols-3 md:grid-cols-8` — at the current viewport it collapses to the 3-col fallback, wrapping the 8 tabs into 3 rows.
- The wrapped rows overflow the `TabsList` background pill, so "Settings" visually collides with the "Display Settings" card below (as seen in the screenshot).
- Even at wider viewports, 8 equal columns squeeze icon + label uncomfortably tight.

## Fix (UI-only, presentation layer)

Replace the fixed-grid `TabsList` with a horizontally scrollable flex bar that fits any tab count, then let each tab size to its content. This is a small, surgical change scoped to `src/pages/annual-review/AnnualReviewAdmin.tsx`.

### Changes

1. **TabsList container** — swap `grid grid-cols-3 md:grid-cols-8` for a flex row that scrolls horizontally on narrow screens and wraps cleanly on wide ones:
   - `flex flex-wrap md:flex-nowrap w-full h-auto gap-1 p-1 overflow-x-auto`
   - Remove the fixed grid so tabs never stack into overlapping rows.
2. **TabsTrigger sizing** — add `flex-1 md:flex-none whitespace-nowrap px-3` so:
   - On mobile: each tab shares row width evenly and wraps only on explicit line breaks.
   - On desktop: tabs shrink to their content width and stay on a single row.
3. **Icon + label spacing** — keep existing `gap-1.5` and icons; no label text changes.
4. **No logic, no route, no data-model changes.** Purely CSS class adjustments inside the existing `<Tabs>` block.

### Risk & Impact

- **Data / Workflow / Regression:** None — no state, query, or route touched.
- **UI/UX:** Tab bar becomes single-row on desktop, horizontally scrollable on mobile. Matches the pattern already in use for other admin surfaces.
- **Accessibility:** Tabs remain keyboard-navigable; `overflow-x-auto` preserves focus scrolling.
- **Rollback:** Revert the two className strings.

### Verification

- Reload `/annual-review/admin` and confirm the tab bar renders on one row with no overlap onto the "Display Settings" card.
- Resize to ~768px and ~375px to confirm graceful wrapping / horizontal scroll.

### Out of scope

- Renaming or reordering tabs.
- KPI Library / Weight Matrix internals (P2 remains as-shipped).
