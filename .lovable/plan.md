## Problem

For Prabhu Bediya (201119) — and any employee whose Dept Head and BU Head are the **same person** — the UI is inconsistent:

- **Header / pipeline / Projected Score card**: correctly de-duplicates via `resolveEffectiveChain`. Dept Head is skipped ("1 stage auto-skipped: Dept Head (same reviewer at a higher stage)"), and the score is attributed to **BU Head** (winning stage per POLICY §AR-BU-HEAD-TERMINAL / duplicate-reviewer seniority).
- **Per-criterion chips** at the bottom of each criterion (`Self: 4`, `Dept: 4`) and the **team grid `/5` columns** (SELF/MANAGER/SKIP/**DEPT**/BU/HR) show the response under its **physical** `reviewer_role` (`dept_head`), because that's what got persisted in `annual_review_responses`.

Result: the same locked score simultaneously appears as "Dept" in the grid/chips and as "BU" in the header — confusing and self-contradictory system-wide.

## Root Cause (RCA)

- `annual_review_responses.reviewer_role` stores the **physical stage** where the reviewer acted (`dept_head`). This is correct as an audit record and must not be rewritten (POLICY §88 submission immutability).
- Presentation layers (`TeamReviewDetailContent.comparison`, `AnnualReviewAdmin` team grid columns, `EmployeeResultsView`, `HrFinalizationSheet`, `OverallRecommendationCard`) read `reviewer_role` **verbatim** and label chips/columns by that raw value.
- Only the pipeline / RunningFinalScoreCard / final-score math consumes `resolveEffectiveChain`, which collapses duplicates upward (dept_head → bu_head).
- Therefore any duplicate-reviewer collapse (Dept≡BU, Manager≡BU, Manager≡Dept, etc.) is invisible to chips and grid.

**5 Whys**
1. Why does Dept chip show "Dept: 4" while header shows BU? → Chip reads `reviewer_role` directly.
2. Why isn't it remapped? → No presentation-layer stage remap exists; only scoring math uses the effective chain.
3. Why was the remap only added to scoring? → Duplicate-reviewer dedup (ADR-108/109) targeted score correctness first; the label layer was assumed to be cosmetic.
4. Why does the grid show DEPT=4.0 but BU=—? → Grid column keys are physical `reviewer_role` slots, not effective-chain slots.
5. Why did the inconsistency surface now? → BU-head-terminal cases (Prabhu, Bhim Rajak, etc.) are rare; historical cycles typically had distinct dept & BU heads.

## Fix (presentation-only; zero mutation of stored responses)

Introduce a **single SSOT presentation mapper** and apply it everywhere a stage label or `/5` column is derived from `reviewer_role`.

### 1. New pure helper — `src/lib/annualReview/displayStageForResponse.ts`

```ts
// Given the effective chain + a stored response, return the stage the response
// should DISPLAY as. If the physical stage was collapsed as a duplicate of a
// higher tier, return the higher tier. Otherwise return the physical stage.
displayStageForResponse(response, effectiveChain): AnnualReviewerRole
```

Rules:
- If `effectiveChain` marks `response.reviewer_role` as `skipped` with `skipReason === 'duplicate_reviewer'` **and** the `duplicateOf` stage has NO stored response of its own → present the row as `duplicateOf`.
- If the higher stage already has its own response, keep the physical label (do not merge — both are real).
- `self` never remaps.
- BU-head-terminal (`skipReason === 'bu_head_terminal'`) already means the row shouldn't exist; log a diagnostic but keep physical label to avoid data loss in the UI.

### 2. Group responses by display stage — `src/lib/annualReview/responsesByDisplayStage.ts`

Utility used by every consumer:
```ts
groupResponsesByDisplayStage(responses, effectiveChain)
  → Record<AnnualReviewerRole, AnnualReviewResponse | null>
```

### 3. Wire consumers to the remap (surgical edits only)

| File | Change |
|---|---|
| `src/components/annual-review/TeamReviewDetailContent.tsx` (L150–162) | Replace `r.reviewer_role` label lookup with `displayStageForResponse(...)`. Result: chips read "Self: 4 | BU: 4" for Prabhu instead of "Self: 4 | Dept: 4". |
| `src/pages/annual-review/AnnualReviewAdmin.tsx` (grid `SELF/MANAGER/SKIP/DEPT/BU/HR /5` columns, near L946) | Feed columns from `groupResponsesByDisplayStage` instead of raw `reviewer_role`. Dept column will render `—`; BU column will render 4.0 for Prabhu / Bhim Rajak. |
| `src/components/annual-review/EmployeeResultsView.tsx` (L35 `byRole = new Map(...)`) | Build map from `groupResponsesByDisplayStage` for stage cards & Criteria panel. |
| `src/components/annual-review/HrFinalizationSheet.tsx` (L75, L104) | Use display map when checking "which stages are locked" for HR's completeness banner. |
| `src/components/annual-review/OverallRecommendationCard.tsx` (L39–L87) | Group notes by display stage so a duplicate Dept/BU note is attributed once, to the winning stage. |
| `src/pages/annual-review/ManagerCalibration.tsx` (L59–L60) | Also route through display mapper (defensive; manager rarely collides, but keep SSOT). |
| Exports — `src/components/annual-review/AnnualReviewExportMenu.tsx` (L224) | Add a computed `display_reviewer_role` column so CSV/XLSX exports match the on-screen values. Keep raw `reviewer_role` too, marked as "physical stage" for auditors. |

### 4. Regression tests

- `displayStageForResponse.test.ts` — Prabhu case (Dept≡BU, both responses stored as `dept_head`), Ankit/Jaspal case, Manager≡Dept≡BU triple collapse, self never remaps, BU-head-terminal, no false remap when both stages have real distinct responses.
- `TeamReviewDetailContent.test.tsx` — chips render "BU: 4" (not "Dept: 4") for a Dept≡BU instance.
- `AnnualReviewAdmin.test.tsx` — grid: DEPT `/5` cell = `—`, BU `/5` cell = 4.0 when reviewer collapses upward.
- `EmployeeResultsView.test.tsx` — stage card for BU Head shows the collapsed score; Dept card hidden / shows "Skipped (same reviewer as BU Head)".
- Existing `stageForReviewer` and `effectiveChain` tests remain unchanged.

### 5. Docs & policy

- **ADR-128 — Display Stage Remap for Duplicate Reviewers** (presentation-only SSOT).
- **POLICY §AR-STAGE-LABEL-DISPLAY-SSOT**: every UI/CSV surface that labels a stored response MUST route through `displayStageForResponse`; direct `reviewer_role` label lookups are forbidden outside audit views.
- Update `DOCUMENTATION.md v2.66.119` — Version History entry.

## Risk & Impact

- **Data impact**: none. `annual_review_responses.reviewer_role` untouched. No migrations.
- **Workflow impact**: none. Stage advancement, RLS, and final-score math already use the effective chain.
- **UI/UX**: chips/grid/exports now agree with header. Old "Dept: 4" chips vanish for collapsed cases and reappear as "BU: 4". Users see one consistent stage everywhere.
- **Regression risk**: Low — the mapper is pure, defaults to physical stage when the effective chain lacks a duplicate flag. Rollback = revert 6 file edits + delete helper.
- **Scalability**: O(1) per response; effective chain already computed once per instance page.

## Rollback

Feature-flagged behind a compile-time constant `USE_DISPLAY_STAGE_REMAP` (default `true`). Flip to `false` to fall back to raw `reviewer_role` if regressions surface.

## Deliverables

1. `src/lib/annualReview/displayStageForResponse.ts` + `responsesByDisplayStage.ts` (+ tests).
2. Wired into the 7 consumer files above.
3. `docs/adr/ADR-128.md`, POLICY.md §AR-STAGE-LABEL-DISPLAY-SSOT, DOCUMENTATION.md v2.66.119.
4. Regression tests for chips, grid, results view, exports.
