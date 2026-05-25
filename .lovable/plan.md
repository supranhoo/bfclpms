## Problem

At 100% zoom on the `/review/bulk-scoring` page, the **filter row wraps into multiple rows** (the current grid uses `grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-8`), which pushes the matrix down and forces users to zoom out to 50% to see everything. The matrix grid itself already implements sticky KPI column + horizontal scroll correctly (verified in `BulkReviewMatrixGrid.tsx`).

So the fix is scoped almost entirely to the **Row 2 filter bar** in `BulkReviewDashboard.tsx`, plus a small width-utilization tweak on the page container.

## Risk & Impact Report

- **Data Impact:** None. Pure presentation.
- **Workflow Impact:** None. No RPC, RLS, hook, or state-shape change.
- **UI/UX Impact:** Filter bar becomes a single horizontal row; on narrow viewports it scrolls horizontally instead of wrapping. Matrix gets the freed vertical space back. KPI column stays frozen (already implemented).
- **Regression Risk:** Low. Only Tailwind classes on filter wrappers and the page outer container change. No behavior change to filters themselves.
- **Mitigation:** Manual QA at 1309×853 (user's reported breakpoint), 1920×1080, and 768×1024.

## Plan

### 1. Filter bar → single-row, no-wrap, horizontal-scroll (`BulkReviewDashboard.tsx`, Row 2)

Replace the wrapping grid with a no-wrap flex row:

- Container: `flex flex-nowrap items-center gap-2 overflow-x-auto` + `matrix-scroll` class (reuse the themed scrollbar from `index.css`) and `scrollbar-thin`.
- Each filter wrapper gets `shrink-0` so they don't squeeze; remove `w-full` from individual `SelectTrigger`s and replace with fixed compact widths (`w-[120px]` for Month/Year, `w-[150px]` for Company/Division/BU/Department/Category/KRA).
- Keep the existing icon + `SelectValue` layout — only the wrapper classes change.
- Row height stays `h-11`; keep `bg-muted/30`.

### 2. Page width — use full screen width

- Outer page `<div className="w-full">` is fine, but the matrix `<main>` parent in the layout may apply `max-w-*` / `container` padding. Check `src/components/layout/*` for the wrapper used by `/review/bulk-scoring` and, if it caps width, render this page through a full-bleed wrapper (or override with `max-w-none px-2`).
- Reduce page-level horizontal padding from `px-4` to `px-2 sm:px-4` on the sticky header rows to claw back ~16px for the matrix.

### 3. Matrix container — already correct, minor verification only

Already in `BulkReviewMatrixGrid.tsx`:
- `overflow-auto` + `matrix-scroll` on scroller ✓
- `position: sticky; left: 0; z-index: 10` on KPI cells with opaque zebra bg ✓
- `border-separate border-spacing-0` table with `width: totalW` ✓
- Sticky top header ✓

No code change needed here. Just confirm visually after the filter-bar fix.

### 4. Acceptance check

At 100% zoom on 1309×853 viewport:
- [ ] Filter row renders on **one line**; if it overflows, horizontal scroll appears inside that row only (page does not scroll horizontally).
- [ ] Matrix occupies the full viewport width below the sticky header.
- [ ] KPI/KRA column stays frozen while employees scroll horizontally.
- [ ] No employee columns clipped or hidden — all reachable via scroll.
- [ ] No browser zoom-out required.

## Files to Change

- `src/pages/review/BulkReviewDashboard.tsx` — Row 2 filter container classes + per-filter wrapper widths; minor page-padding tweak.
- `src/components/layout/*` (only if a `max-w-*` wrapper is found that caps this route) — allow full-bleed for `/review/bulk-scoring`.
- `DOCUMENTATION.md` + `mem/features/review/bulk-review-dashboard` — record v2.66.12.8 filter-bar polish.

## Not Applicable

- Schema / RLS / RPC / migrations — none.
- Tests — pure CSS class change, covered by existing matrix tests.
- Backup — not affected.

## Out of Scope (will NOT change)

- Hooks (`useBulkReview*`), RPCs, workflow engine, scoring logic, edge functions.
- Matrix grid component internals (already correct).
- Filter values, options, or behavior.
