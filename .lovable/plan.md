# Test Result

Verified at `/review/bulk-scoring` (1366×768, Admin view, May 2026, 140 emp / 2150 KPI). After clicking Load Scope the matrix renders, **but the KPI/KRA frozen column is missing from the visible area** — it has been pushed off-screen to the left **behind the sidebar**. There is a **document-level horizontal scrollbar at the bottom of `<main>`** (not inside the matrix card). When the user scrolls horizontally the whole page moves, taking the "sticky" KPI column with it. Sticky behavior is therefore not working.

# True Root Cause (different from the previous fix)

The previous patch (remove `content-visibility`, raise z-index, isolate stacking) was correct but insufficient — sticky positioning *itself* was already working. The real problem is **the wrong element is doing the scrolling**:

```
SidebarProvider (flex-row)
└── SidebarInset (<main>, flex-1, NO min-w-0)        ← grows to fit wide table
    └── DashboardLayout <main> (flex-1 overflow-auto) ← ends up scrolling horizontally
        └── BulkReviewDashboard <div w-full>
            └── card <div>
                └── .matrix-scroll (overflow-auto)    ← never gets a chance to scroll
                    └── <table style="width: 16000px">
```

`SidebarInset` is a flex-row child with `flex-1` but **no `min-w-0`**. CSS default `min-width: auto` on flex items lets the inset expand to its widest child (the 16k-px table). That makes the inner `<main>` the scrolling layer instead of `.matrix-scroll`. Since `position: sticky` is relative to the nearest scrolling ancestor, the KPI column sticks to `.matrix-scroll` — which never scrolls — and slides off with the outer main scroll.

This is the classic flexbox-overflow gotcha and affects every wide grid in the app, but Bulk Review is the only place it hurts visibly today.

# Fix (one-line, surgical, global benefit)

### `src/components/layout/DashboardLayout.tsx`
Pass `min-w-0` to `<SidebarInset>` so the flex item can shrink below its content width. The inner `<main>`'s existing `overflow-auto` continues to clip overflow vertically; `.matrix-scroll`'s `overflow-auto` will now own horizontal scrolling, which is exactly where the sticky left column is anchored.

```diff
- <SidebarInset>
+ <SidebarInset className="min-w-0">
    <main className="flex-1 overflow-auto p-3 sm:p-6 bg-muted/30">
```

Also add `overflow-x-hidden` to the inner `<main>` so any other future wide page can never push the document horizontally — sticky headers and sidebars depend on it.

```diff
- <main className="flex-1 overflow-auto p-3 sm:p-6 bg-muted/30">
+ <main className="flex-1 overflow-y-auto overflow-x-hidden p-3 sm:p-6 bg-muted/30 min-w-0">
```

### `mem/features/review/bulk-review-dashboard`
Append v2.66.12.11 note: sticky KPI column issue traced to missing `min-w-0` on the layout `<SidebarInset>` / `<main>` chain (flexbox `min-width: auto` was letting outer scroll containers absorb the wide-table overflow, defeating the inner `.matrix-scroll` sticky).

### `DOCUMENTATION.md`
One-line entry mirroring the memory note.

# Risk & Impact

- **Data / Workflow / RLS / RPC:** None.
- **UI/UX:** Other pages now have an explicitly clipped main `<main>` horizontally. Any page that *intentionally* needed document-level horizontal scroll loses it — but the codebase pattern is always to wrap wide content in its own `overflow-x-auto` container (matrix grids, KPI mapping matrix, reports tables), so the change is net-neutral elsewhere and net-positive for sticky behavior throughout.
- **Regression risk:** Very low. `min-w-0` is the standard fix for the flexbox overflow gotcha; `overflow-x-hidden` on the page main was already the implicit expectation (sticky headers and the sidebar both assume the page doesn't scroll horizontally).
- **Scalability:** Pure CSS change; no runtime cost.

# Verification

- 1366×768 and 1920×1080 at 100% zoom on `/review/bulk-scoring` → click Load Scope.
  - KPI/KRA column visible at the left edge of the matrix card on initial render.
  - Horizontal scrollbar appears **inside** the matrix card (not at the bottom of the page).
  - Drag the matrix horizontal scrollbar right → employee columns scroll, KPI/KRA column stays anchored, top-left corner stays pinned.
  - Vertical scroll → employee header row stays pinned, KPI cells scroll with the matrix.
- Spot-check 2–3 other heavy pages (KPI Mapping Matrix, Performance Report, Reports Hub) → no layout regression, sticky elements still behave.

# Out of Scope

- Filter bar layout (already shipped v2.66.12.8).
- Sticky cell z-index / content-visibility (already shipped v2.66.12.9).
- KRA dropdown derivation (already shipped v2.66.12.10).
- RPC / schema / migrations / backup.

# Rollback

Revert two className additions in `DashboardLayout.tsx` — no DB or contract changes.

# Not Applicable

Schema / RLS / migrations / backup / new tests (pure CSS class change on layout; existing manual verification covers the only affected page).
