## Goal

Surface the **true scoring model** to the employee (and reviewers) so it's obvious that the final appraisal = `System Score (auto, e.g. Carry KRA) + Criteria Score (self/manager-rated) → capped at 100`.

Right now the form only shows the **criteria** portion as "Total Score". The System Score (which may already be 80–100% of the appraisal) is rendered as a card with its own progress bar but is never combined into a single visible total, leaving users — and the pre-submit dialog — looking at "0.00 / 0.00" when in reality the appraisal is mostly System driven.

## Root Cause

`computeOverallScore(systemScoresConfig, systemScoresValues, criteriaSummary)` already correctly returns the combined number — but **no UI surface calls it for the employee**. `EmployeeAnnualReview.tsx` only uses `computeCriteriaScore(...)` and pipes that summary into the footer + `SelfReviewSummaryDialog`. The dialog and footer treat the criteria score as "Total". The System Score panel shows per-line "Max weight" and a bar but never explains "this contributes X of 100 to your appraisal".

## Risk & Impact Report

- **Data impact:** None. Pure presentation; persistence, advance/send-back, audit untouched.
- **Workflow impact:** None. Submit flow, blockers, RPC contracts unchanged.
- **UI/UX impact:** New compact "Appraisal Composition" summary card appears at the top of the employee page (and in the pre-submit dialog) showing `System X / Wsys + Criteria Y / Wcrit = Overall Z / 100`, with a single progress bar. The existing System Scores panel gets a clearer per-line "Contributes X of Y points" caption. Footer "Score: …" line replaced with the same Overall total.
- **Regression risk:** Low — all changes funnel through the existing `computeOverallScore` SSOT. Templates with only criteria or only system-scores render the same numbers, just with clearer labels.
- **Scalability:** O(n) over template config — negligible.
- **Rollback:** Revert three component edits + one new component.

## Conceptual Model (made explicit in UI copy)

```
                      Appraisal (out of 100)
                                  |
              +-------------------+--------------------+
              |                                        |
        System Score                               Criteria Score
   (auto, e.g. Carry KRA)                       (rated by reviewer)
        weight = Wsys                              weight = Wcrit
              |                                        |
     value already in % points              Σ(weight × score) / Σ(weight × 5)
                                            scaled into % points
              |                                        |
              +-------------------+--------------------+
                                  |
                            Overall = clamp( Sys + Crit , 0..100 )
```

Two invariants we will now show on screen:

1. `Wsys + Wcrit ≤ 100` (admin-configured; we display the configured caps).
2. `Overall = systemTotal + criteriaContribution`, capped at 100.

## Implementation Steps

### 1. New SSOT helper for the "composition" view

File: `src/lib/annualReview/scoringComposition.ts` (new)

- `computeScoreComposition(template, systemScoresValues, criteriaScores)` returns:
  - `systemActual`, `systemMax` (sum of `system_scores[].weight`)
  - `criteriaActual` (the criteria contribution **scaled** into percentage points using `criteriaActualPct = (totalCriteriaScore / maxCriteriaScore) * Wcrit` so it matches what gets added to the final overall — falls back to 0 when `maxCriteriaScore` is 0)
  - `criteriaMax` = `100 − systemMax` (the room the criteria can fill, derived; clamped ≥ 0)
  - `overallActual`, `overallMax = 100`
  - `criteriaRaw`, `criteriaRawMax` (the existing `totalCriteriaScore / maxCriteriaScore` numbers, kept for the "raw" mini-display inside the Criteria table)
- Pure function, fully unit-testable.

**Important:** the existing `computeOverallScore` treats `system_scores[id]` as already-in-percentage-points and just **adds** `criteriaSummary.totalCriteriaScore`. We will keep that contract for back-compat. The new `composition` helper normalises *for display* so the user sees consistent "/100" math.

### 2. New shared UI component

File: `src/components/annual-review/AppraisalCompositionCard.tsx` (new)

- Compact 3-column card: `System Score · Criteria Score · Overall`. Each shows `value / max` and a thin progress bar. Bottom row: single 100-cap progress bar with the Overall percentage.
- Variants:
  - `variant="full"` — used at the top of the employee page and inside the pre-submit dialog.
  - `variant="inline"` — used in the sticky footer (single line: "Overall X / 100 · System X · Criteria Y").
- Empty-state friendly: if `systemMax === 0` it hides the System column; if `criteriaMax === 0` (template = 100% system) it hides the Criteria column and clearly says "Auto-scored — no criteria to rate".

### 3. Wire into the Employee page

File: `src/pages/annual-review/EmployeeAnnualReview.tsx`

- Import `computeScoreComposition` + `AppraisalCompositionCard`.
- Derive `composition` via `useMemo` from `template`, `instance.system_scores`, `draft.criteria_scores`.
- Render `<AppraisalCompositionCard variant="full" composition={composition} />` directly under the stage tracker (above System Scores panel) so the breakdown is the first thing the employee sees.
- Replace the footer line `Score: ${summary.totalCriteriaScore} / ${summary.maxCriteriaScore}` with `<AppraisalCompositionCard variant="inline" composition={composition} />`.

### 4. Wire into the pre-submit dialog

File: `src/components/annual-review/SelfReviewSummaryDialog.tsx`

- Add `composition` to props (computed in the parent and passed in).
- Replace the current "Total Score 0.00 / 0.00 · Weighted Achievement 0.0%" gradient banner with `<AppraisalCompositionCard variant="full" composition={composition} />`.
- Keep the criteria table beneath as today (only when not hidden by the existing visibility rule).
- The "system-full notice" we just added is no longer needed when the composition card itself spells it out — keep the explainer text but render it inside the card's empty-state for the Criteria column.

### 5. Clarify each System Score card line

File: `src/components/annual-review/SystemScoresPanel.tsx`

- Per-line: replace `Max weight: {s.weight}` with `Contributes {value} / {s.weight} points to your appraisal` (uses `t('system_scores.contribution', …)`).
- For Carry KRA cards: add a single muted line under the existing Achieved/Out Of/Rating row saying `"Auto-computed from KRA monthly scores · contributes to your appraisal total above"`.

### 6. Wire into reviewer (team) page (parity)

File: `src/components/annual-review/TeamReviewDetailContent.tsx`

- Same `AppraisalCompositionCard` rendered under the stage header so reviewers see the same breakdown as the employee — using the reviewer's own draft criteria scores layered on top of the instance's system scores.

### 7. Tests

- `src/lib/annualReview/scoringComposition.test.ts` (new) — cases:
  - 100% system (carry_kra weight=100, no criteria) → composition shows Sys 80/100, Crit 0/0, Overall 80/100.
  - 50/50 split (system weight 50, criteria weights summing 50, perfect 5-rating on every criterion) → 50 + 50 = 100.
  - Partial criteria scoring → criteria scaled proportionally, overall clamped at 100.
  - Empty template → all zeros, no division by zero.
  - Backward parity: `composition.overallActual === computeOverallScore(...)` for every case.

### 8. Docs + memory

- `src/modules/annual-review/POLICY.md` — append version-history entry: "Appraisal composition is surfaced as System + Criteria + Overall in the employee form, footer, pre-submit dialog and team-review page. SSOT: `scoringComposition.ts` + `AppraisalCompositionCard.tsx`. The persisted math (`computeOverallScore`) is unchanged."
- `mem/features/annual-review/overview.md` — one-line addition: "Employee + reviewer UI shows the System / Criteria / Overall breakdown via `AppraisalCompositionCard`; `computeOverallScore` remains the persistence SSOT."

## UI Change Summary

- **Where:** Employee Annual Review page (top + footer), Self-Review Pre-Submit dialog (replaces the criteria-only banner), Team Review Detail page (top), System Scores panel (per-line caption).
- **What changes visually:** A new 3-column composition card with progress bars makes "System + Criteria = Overall (/100)" obvious. Per-system-score lines explicitly say how much they contribute. Footer always shows the same Overall number.
- **Interaction impact:** None. No buttons or flows change.
- **Responsiveness:** Card collapses to single-column on mobile; existing card primitives.

## Out of Scope

- Changing the persisted scoring math (`computeOverallScore` stays the SSOT for what gets saved).
- Admin-side template editor changes — we already enforce weight caps via the template editor.
- Changing how the reviewer overrides system scores; that path is admin-only and remains unchanged.
