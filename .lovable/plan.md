## Goal

Make the **Self-Review Pre-Submit Dialog** (`SelfReviewSummaryDialog.tsx`) consistent with the criteria-card hide rule we just shipped. When criteria don't contribute to the score (no self-criteria mapped OR `system_scores` weights ≥ 100), the dialog must NOT show the misleading "Total Score 0.00 / 0.00 — Weighted Achievement 0.0%" banner or the empty Criteria section.

## Root Cause

The dialog renders the score banner unconditionally and renders the Criteria section gated only on `criteria.length > 0`. It doesn't consult `shouldHideCriteriaCard`, so when system scores already total 100% — or when no self-criteria are mapped — the user sees a meaningless 0.00 score block and a misleading 0% achievement bar.

## Risk & Impact Report

- **Data impact:** None. Purely presentational; persistence and submit logic untouched.
- **Workflow impact:** None. Submit / Cancel buttons unchanged. `hasBlockers` (required qualitative fields) gate still applies.
- **UI/UX impact:** When criteria are hidden, the score banner and the Criteria section disappear. The Qualitative Responses section and the Evidence section remain. If there's nothing besides system scores + qualitative responses, the dialog shows a single muted line: "System scores are already weighted at 100% — no self-assessment criteria to score." (or the no-criteria-mapped variant).
- **Regression risk:** Low. Templates with self-criteria continue to render the existing banner and criteria table unchanged. Tests stay green.
- **Scalability:** O(1).
- **Rollback:** Single component edit.

## Implementation Steps

### 1. Reuse the SSOT helper

`SelfReviewSummaryDialog.tsx`:

- Import `shouldHideCriteriaCard`, `criteriaForStage`, `systemScoresFullyAllocated` from `@/lib/annualReview/templateVisibility`.
- Derive `hideCriteria = shouldHideCriteriaCard(template, 'self')`.
- Replace the inline `(template?.sections.criteria ?? []).filter(...)` with `criteriaForStage(template, 'self')` for consistency.

### 2. Gate the score banner + criteria section

- Render the Total Score / Weighted Achievement banner only when `!hideCriteria`.
- Render the Criteria section only when `!hideCriteria && criteria.length > 0` (the second guard becomes redundant once hide rule is on, kept defensively).
- Render the Evidence per-criterion loop only when `!hideCriteria` (it currently iterates over `criteria` to group files; when hidden, fall back to a flat list of all `draft.evidence` files).

### 3. Insert a clarifying notice when hidden

- When `hideCriteria === true`, insert a single muted card above the Qualitative section:
  - If `systemScoresFullyAllocated(template)` → "This template's system scores already total 100%. There are no self-assessment criteria to score — your qualitative responses below will be submitted."
  - Else → "This template has no self-assessment criteria mapped. Your qualitative responses below will be submitted."

### 4. Tests

Add to `src/lib/annualReview/templateVisibility.test.ts` (already exists) a regression case asserting `shouldHideCriteriaCard` returns `true` for the exact scenario from the screenshot — template with 4 required qualitative fields, zero criteria, and system scores summing to 100. (Already covered by existing test "hides every stage when system scores sum to 100"; will add the empty-criteria-+-fields combo explicitly for clarity.)

No new test file needed.

### 5. Docs

- `src/modules/annual-review/POLICY.md` — append note to the existing 2026-06-21 visibility entry that the same rule extends to the pre-submit summary dialog.

## Out of Scope

- Changing scoring math, eligibility, or system-score rendering.
- Hiding the dialog entirely (the qualitative responses + evidence still need explicit confirmation).
- Renaming the dialog title — copy remains "Review your self-assessment before submitting" so the action stays familiar.

## UI Change Summary

- **Where:** Pre-submit confirmation dialog launched from Employee Annual Review page.
- **What changes visually:** When criteria are hidden, the blue "TOTAL SCORE 0.00 / 0.00 — WEIGHTED ACHIEVEMENT 0.0%" banner and the criteria table disappear. A single muted line explains why. Qualitative Responses and Evidence sections render as today.
- **Interaction impact:** None. Footer buttons, blockers, language switcher all unchanged.
- **Responsiveness:** No layout changes outside the gated sections.
