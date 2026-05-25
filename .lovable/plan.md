## Problem

User reports the KPI/KRA column **scrolls away** with the employee columns at 100% zoom — meaning `position: sticky` is not being honored. The current implementation in `BulkReviewMatrixGrid.tsx` already sets `sticky left-0` on the KPI `<td>` cells, so something is breaking sticky behavior.

Most likely root causes (all in `BulkReviewMatrixGrid.tsx`):

1. **`content-visibility: auto` on each `<tr>`** (line 238) — known to break `position: sticky` paint on table cells in Chromium because the row becomes its own containment context.
2. **`overflow: hidden` on the outer wrapper** (line 156, `rounded-lg border … overflow-hidden`) — when combined with the inner scroll container, this can clip sticky cells in some layouts.
3. **z-index too low** — sticky KPI body cells use `z-10`, employee body cells have no explicit z-index but inherit table stacking; under certain ancestor `transform`/`will-change`, the sticky cell gets pushed under siblings, which visually reads as "scrolling away."
4. **Possible `transform` on an ancestor** (sidebar/layout) creates a new containing block and breaks sticky relative to the intended scroller.

## Risk & Impact

- **Data:** None.
- **Workflow / RLS / RPC:** None.
- **UI/UX:** Sticky KPI column starts working; visual identical otherwise. Loses the off-screen paint skip from `content-visibility` (negligible — we already cap at 25k cells).
- **Regression risk:** Very low. Pure CSS class adjustments on one component.
- **Scalability:** Removing `content-visibility` may add minor paint cost for very tall matrices; mitigated by existing 25k-cell scope cap and `max-h-[calc(100vh-180px)]` scroll container.

## Plan (minimal, surgical)

Edit only `src/components/review/BulkReviewMatrixGrid.tsx`:

1. **Remove `content-visibility: auto` + `containIntrinsicSize`** from the KPI `<tr>` (line 238). This is the #1 sticky-killer.
2. **Raise sticky KPI body cell z-index** from `z-10` → `z-30` (still below the sticky top headers at `z-40`/corner `z-50`). Ensures KPI cells paint above scrolling employee cells.
3. **Replace outer `overflow-hidden`** on the card wrapper (line 156) with `overflow-clip` is risky — instead drop `overflow-hidden` entirely and let the inner `matrix-scroll` element own clipping. Keep `rounded-lg border` + add `isolation-auto` so the sticky stacking context is the inner scroller only.
4. **Add `isolate` to the inner `matrix-scroll` div** so sticky stacking context is scoped predictably.
5. **Verify no ancestor `transform`** — quick check of `src/components/layout/*` and `BulkReviewDashboard.tsx` sticky header rows; if any use `transform`, replace with `top`/positioning equivalents on this route only.

## Verification

- Open `/review/bulk-scoring` at 100% zoom on 1095×853 (user's current viewport) and 1920×1080.
- Scroll horizontally inside the matrix → KPI/KRA column must stay pinned at left.
- Scroll vertically → employee header row stays pinned at top; top-left corner stays pinned both ways.
- KRA category bands continue to span full width and align with rows.
- No console errors; no layout shift.

## Files to Change

- `src/components/review/BulkReviewMatrixGrid.tsx` — 4 small class/style edits.
- `DOCUMENTATION.md` + `mem/features/review/bulk-review-dashboard` — record v2.66.12.9 sticky fix (remove `content-visibility`, z-index bump, isolated stacking context).

## Not Applicable

- Schema / RLS / RPC / migrations / backup / tests (pure CSS class change on presentation-only component).

## Out of Scope

- Split-pane rewrite (rejected by user — minimal path chosen).
- Filter bar, hooks, scoring logic, RPCs.

## Rollback

Revert the single component file — no DB or contract changes.
