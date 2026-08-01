# ADR-218j — Overall recommendation is a dedicated row, never a criterion

Status: Accepted (2026-08-01)

## Context
`buildStageBlocks` derived criterion ids from `criteria_scores` plus every key of
`qualitative_responses`, filtering only `self_review_fields`. The reserved key
`__overall_recommendation` (ADR-226) shares that map, so the review-form viewer showed a
literal `__overall_recommendation` row with "—" scores, and the reviewer's prose was only
reachable through a speech-bubble tooltip that clipped off the right edge of the dialog.

## Decision
- `reviewFormView.ts` exports `OVERALL_RECOMMENDATION_KEY` (pure mirror of
  `RECOMMENDATION_KEY`), filters it out of criteria, and surfaces it as
  `StageBlock.recommendation` (trimmed, `null` when blank).
- `StageComparisonTable` renders an **Overall recommendation** tfoot row with wrapped,
  left-aligned text beside the existing **Overall remark** row.
- Criterion-remark tooltips get `side="left"` + `collisionPadding={16}` so they can never
  render outside the dialog.

## Consequences
Presentation + pure-builder change. No RPC, RLS, schema or scoring change.
Guard: `src/lib/annualReview/reviewFormView.test.ts`.

## Rollback
Revert `reviewFormView.ts` and `StageComparisonTable.tsx`.
