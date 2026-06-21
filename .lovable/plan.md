## Goal

Hide the Self-Assessment / Reviewer "Criteria" card on every annual-review stage page when **either** condition is true:

1. No criteria are mapped to that stage (`reviewer_stages` filter yields zero rows), OR
2. The template's `system_scores` weights already sum to 100, leaving criteria with no mathematical contribution.

Submit flow is unchanged — the reviewer/employee still clicks Submit to advance.

## Risk & Impact Report

- **Data impact:** None. Pure presentational filter on existing template config. Stored `criteria_scores` are untouched.
- **Workflow impact:** None. Advance / send-back RPCs continue to work; submit button still posts.
- **UI/UX impact:** Empty criteria card disappears from Employee + Manager + Dept + BU + HR review pages when condition holds. A small info banner replaces it ("No criteria to score for this stage — Submit to advance"). Qualitative card (already conditional) is unaffected.
- **Regression risk:** Low. Templates with criteria mapped to specific stages continue to render normally on those stages. The 100%-system-score case is rare today but valid (system-only templates).
- **Scalability:** O(1) — single derived boolean per render.
- **Rollback:** Revert two component edits + one helper.

## Implementation Steps

### 1. Add a shared SSOT helper

File: `src/lib/annualReview/templateVisibility.ts` (new)

- `criteriaForStage(template, stage)` — returns `Criterion[]` filtered by `reviewer_stages` (mirrors the inline filter in `EmployeeAnnualReview.tsx` line 182).
- `systemScoresFullyAllocated(template)` — sums `system_scores[].weight`; returns `true` when sum >= 100.
- `shouldHideCriteriaCard(template, stage)` — returns `true` when `criteriaForStage(...).length === 0` OR `systemScoresFullyAllocated(template)`.
- Pure functions, fully unit-testable.

### 2. Apply in employee self-review page

File: `src/pages/annual-review/EmployeeAnnualReview.tsx`

- Replace the unconditional `<Card>` wrapper around `CriteriaScoringMatrix` (lines 178–194) with a conditional render gated by `shouldHideCriteriaCard(template, 'self')`.
- When hidden, render a single muted info banner: `"No self-assessment criteria for this template. Review the system scores above and click Submit to advance."`
- Submit button + footer unchanged.

### 3. Apply in reviewer (team) page

File: `src/components/annual-review/TeamReviewDetailContent.tsx`

- Locate the criteria matrix render block; gate it with `shouldHideCriteriaCard(template, currentReviewerRole)` where `currentReviewerRole` is the stage being reviewed.
- Same info banner copy, parameterised by stage label.

### 4. Tests

File: `src/lib/annualReview/templateVisibility.test.ts` (new)

- Template with no criteria → hide for every stage.
- Template with criteria but none mapped to `self` → hide for `self`, show for stages that ARE mapped.
- Template with `system_scores` summing to 100 → hide for every stage even if criteria exist.
- Template with `system_scores` summing to 99 → show.
- Template with mixed `reviewer_stages` (e.g. some criteria for `manager` only) → correct per-stage decision.

### 5. Docs

- `src/modules/annual-review/POLICY.md` — add version-history entry documenting the new visibility rule and the two trigger conditions.
- `mem/features/annual-review/overview.md` — one-line addition under the rendering section.

## Out of Scope

- Auto-advancing past the self stage (user explicitly chose to keep Submit).
- Changing the scoring math or `criteria_scores` storage.
- Hiding the Qualitative Responses card (already conditional).
- Admin-side validation warning when a template is configured with no self criteria — could be a follow-up.

## UI Change Summary

- **Where:** Employee Annual Review page + Team Review Detail page.
- **What changes visually:** Self-Assessment Criteria (or stage-equivalent) `<Card>` disappears; replaced by a muted single-line info banner. Stepper, system scores panel, qualitative card, and footer are unchanged.
- **Interaction impact:** None — Submit button retains the same position and behaviour.
- **Responsiveness:** Info banner uses existing `Card` styling, no new breakpoints.
