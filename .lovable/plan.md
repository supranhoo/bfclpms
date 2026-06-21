## Problem

When Criteria isn't mapped, the breakdown card shows two columns with the **same** number:

- `SYSTEM SCORE 99.00 / 100`
- `OVERALL 99.00 / 100`

Plus a full-width progress bar repeating `99.0%`. With only one contributor, System == Overall by definition, so the breakdown adds no information — it just looks like a bug ("why is this printed twice?").

The mirror case is true if a template ever had Criteria-only (no System): Criteria would equal Overall.

## Goal

The composition card should only show a *breakdown* when there is actually something to break down (System **and** Criteria both contribute). Otherwise collapse to a single, non-redundant summary.

## Proposed behavior

In `AppraisalCompositionCard.tsx` (`variant="full"`):

1. Compute `contributingParts = (systemMax > 0 ? 1 : 0) + (criteriaMax > 0 ? 1 : 0)`.
2. **If `contributingParts >= 2`** → render today's layout (System + Criteria + Overall, 3 columns), unchanged.
3. **If `contributingParts <= 1`** → render a single "Overall" column only (no duplicate System/Criteria card, no full-width progress bar underneath). The single column keeps the score, "/ 100", and a short hint like:
   - "Auto-fetched from KRA" when only System contributes.
   - "Rated against criteria" when only Criteria contributes.
   - "No score configured" when neither contributes (defensive — shouldn't normally happen).

The `inline` variant already hides System/Criteria chips when their max is 0, so no change there.

No other components, no business logic, no scoring math touched.

## Risk & Impact

- **Data impact:** None — purely presentational.
- **Workflow impact:** None.
- **UI/UX:** Reviewers no longer see the same number printed twice when only one component contributes. Templates with both components keep the existing 3-column view unchanged.
- **Regression risk:** Low. Only `AppraisalCompositionCard` (`full` variant) layout branches. Callers (form header, pre-submit dialog) pass the same `ScoreComposition` and don't depend on the internal column count.
- **Mitigation:** Add unit tests for the three cases (both contribute, system-only, criteria-only) asserting which columns render.

## Files

- `src/components/annual-review/AppraisalCompositionCard.tsx` — branch the `full` variant on `contributingParts`.
- `src/components/annual-review/AppraisalCompositionCard.test.tsx` *(new)* — render tests for the three cases.
- `POLICY.md` — short note under the annual-review composition section: "Breakdown card collapses to a single Overall summary when only one component (System or Criteria) contributes — duplicate columns are suppressed."
- `DOCUMENTATION.md` — same one-liner in the AppraisalCompositionCard section.

## Not in scope

- Removing the card entirely.
- Changing the sticky-footer inline summary (already handles zero-max correctly).
- Any scoring / template / RLS changes.
