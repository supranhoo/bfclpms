# ADR-218f — Wide review-form viewer with a side-by-side reviewer matrix

Status: Accepted (2026-08-01)

## Context
The read-only "Submitted review form" dialog (ADR-218e) stacked one card per
reviewer stage. Comparing Self vs Dept Head vs BU Head ratings required
scrolling between cards, and the 4xl dialog wasted horizontal space.

## Decision
- Dialog widened to `w-[96vw] max-w-[1400px]` (still `max-h-[90vh]`, internal scroll).
- New pure builder `buildStageMatrix()` in `src/lib/annualReview/reviewFormView.ts`
  pivots the existing stage blocks into columns (canonical `STAGE_ORDER`) × criterion rows.
- New presentation component `src/components/annual-review/StageComparisonTable.tsx`
  renders the matrix with a sticky criterion column, per-stage header
  (label / reviewer / submitted date), and tfoot rows for stage score and overall remark.
- Per-criterion remarks stay accessible: icon indicator + tooltip, plus a
  "Criterion remarks" collapsible list (never hover-only).
- Below `md` the previous stacked per-stage cards are kept.

## Consequences
Read-only, presentation-only change. No hook, RPC, RLS, schema or scoring change.
Rollback = revert `StageComparisonTable.tsx`, the builder, and the dialog diff.
