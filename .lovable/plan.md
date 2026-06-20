## Goal
The current `/annual-review/team` page wraps everything in `max-w-5xl mx-auto` and renders each employee as a tall, full-width card with the status badge on a second row. On a 1440px desktop only ~5 employees fit above the fold. Re-cast it as a denser dashboard that uses the full width and stays clean on tablet/mobile — desktop-first.

## Scope (UI/presentation only)
No business logic, services, hooks, RLS, or routing changes. Same data, same handlers (`goToDetail`, `handleDirectoryPick`), same URL-synced filters, same pagination contract. Only the layout, density and responsive breakpoints in `TeamAnnualReview.tsx` change.

## Risk & Impact
- **Data / workflow / regression:** none — purely visual.
- **UI/UX:** intentional restructure of the queue. Tap targets stay ≥44px; status badge moves inline next to the chevron.
- **Mitigation:** keep semantic markup (`<ul>/<li><button>`), preserve aria labels, keep keyboard focus order identical.

## Desktop layout (≥1280px) — primary target
```text
┌───────────────────────────────────────────────────────────────────────┐
│  Team Annual Review · Annual Review 2025-26      [Calibration sheet] │
├──────────────────────┬────────────────────────────────────────────────┤
│ LEFT RAIL (280px)    │ RIGHT: queue grid                              │
│                      │                                                │
│ ╭ Find employee ╮    │ [Search……………………]  [All|Self|Mgr|Skip|BU|HR|Done│
│ │ button + hint │    │                                                │
│ ╰──────────────╯     │ ┌──── card ────┐ ┌──── card ────┐ ┌── card ──┐│
│                      │ │ AK Ashish…   │ │ AK Abhiranj… │ │ UK Umes… ││
│ My queue   2560      │ │ 101903·Appr. │ │ 200792·TK    │ │ 200221·H ││
│                      │ │ • Self Pend. │ │ • Self Pend. │ │ • Self P ││
│ Per page [20 ▾]      │ └──────────────┘ └──────────────┘ └──────────┘│
│                      │ … 3-col grid, ~9 cards above the fold …       │
│                      │                                                │
│                      │ 1–20 of 2560        ‹  Page 1 / 128  ›        │
└──────────────────────┴────────────────────────────────────────────────┘
```
- Container becomes `max-w-[1600px]` with `lg:grid lg:grid-cols-[280px_1fr] gap-6`.
- The "Find employee" panel, queue counter and per-page selector collapse into the left rail on `lg+`, removing the giant full-width blue button that dominates the current view.
- Cards become a **CSS grid**: `grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-3`. Each card ~96px tall with avatar, name, code·designation, and status badge inline at the bottom.

## Tablet (768–1279px)
- Single column layout (no left rail). "Find employee" becomes a compact header action button (not full-width).
- Queue grid: `sm:grid-cols-2` → 2 cards per row.
- Filter chips + search stay in one row that wraps.

## Mobile (<768px)
- Stacked single column (current behaviour, but with tighter card padding `p-3` → `p-2.5`, smaller avatar `h-9 w-9`, status badge moves to the same line as the name on the second row).
- "Find employee" CTA stays prominent but height reduced from `h-12` to `h-10`.
- Per-page selector + queue count move into a compact bar above the list.

## Card spec (shared)
```text
┌───────────────────────────────────────────────┐
│ ⓘ  Ashish Kumar                         ›    │
│    101903 · Apprentice GET                    │
│    ● Self Review Pending     [Assisted]       │
└───────────────────────────────────────────────┘
```
- min-height 84px, hover/focus ring via `hover:border-primary/40 focus-visible:ring-2`.
- Status badge rendered with `size="sm"` style (smaller dot + text) — variant added locally if `AnnualReviewStatusBadge` doesn't expose one (kept inside this file as a CSS wrapper, no badge component change).

## Steps
1. **Refactor `TeamAnnualReview.tsx` layout only:**
   - Replace root `max-w-5xl` with `max-w-[1600px]` and the `lg` two-column grid.
   - Extract the directory CTA, queue meta (count + per-page) into a `<aside>` sidebar block that re-flows above the grid on `<lg`.
   - Replace `<ul className="space-y-1">` with `<ul className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-3">`.
   - Rework the `<li><button>` card markup: single-row header (avatar + name/code/designation + chevron), single-row footer (status badge + Assisted chip + "Awaiting you" highlight).
   - Move pagination footer outside the grid, full-width under it.
2. **Density polish:** reduce vertical paddings on header (`mb-4` → `mb-3`), tighten filter chip row (`gap-1` stays, but moved next to the search field on `md+`).
3. **Verification (manual via preview):**
   - Desktop 1440px: count visible cards above the fold (target ≥9).
   - Tablet 820px: 2-col grid, no horizontal scroll.
   - Mobile 375px: single column, tap targets ≥44px, no clipped text.
   - Keyboard tab order: Find employee → Search → Filter chips → first card → … → pagination.
4. **Docs:** append a short entry to `DOCUMENTATION.md` under the Annual Review section noting the new dashboard layout and breakpoints. No `POLICY.md` change (no policy impact).
5. **Tests:** not applicable — pure presentational change, existing pagination/service tests still cover behaviour. Add a smoke render test only if you want; default plan = skip to keep change surgical.

## Open question (one)
Do you want the **"Find employee" CTA in a left sidebar** on desktop (as drawn above), or kept as a compact button in the page header next to "Calibration worksheet"? Sidebar gives it permanent prominence; header button gives the grid the full width. I'll default to **sidebar on desktop, header-button on tablet/mobile** unless you say otherwise.
