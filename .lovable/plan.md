## What the user is seeing

Ankit Choudhary's review card shows:
- Total score **91.72**
- Criteria weighted score **0.00**
- "Outstanding" badge, but no numeric x / 5

## Root cause (not a data bug)

Ankit's template `sys_bgd6797` is **100% System (Carry-KRA) + 0% Criteria**. So `criteria_weighted_score = 0.00` is arithmetically correct — there are no criteria to score. The problem is purely UI:

1. `EmployeeResultsView.tsx` always renders the "Criteria weighted score" card, even when the template has zero criteria weight. On system-only templates this looks like a failure.
2. The "≈ x / 5" helper is only rendered under the criteria card, so on system-only templates no numeric rating appears anywhere — only the qualitative "Outstanding" badge.
3. There is no "System score" card at all, so the driver of the 91.72 is invisible.

## Plan (UI only — no scoring / DB changes)

### 1. Make the score cards template-aware in `src/components/annual-review/EmployeeResultsView.tsx`
- Compute `hasCriteria = criteriaMax > 0` and `hasSystem = sum(template.system_scores[].weight) > 0`.
- Render cards conditionally:
  - Always: **Total score** (out of 100).
  - Only when `hasCriteria`: **Criteria weighted score** (current card, unchanged).
  - Only when `hasSystem`: **System score (KRA)** — new card driven by the sum of `instance.system_scores` values, matching the existing card's styling.
- Grid becomes `sm:grid-cols-2` when two cards render, `sm:grid-cols-1` when only Total is shown, so it doesn't leave an empty slot.

### 2. Always show numeric rating out of 5 next to Total
- Move the "≈ x / 5" hint out from under the Criteria card and place it under **Total score**, computed as `total_score / 100 * 5` (the same formula the rating band already uses). This guarantees the numeric rating is visible for every template style.

### 3. Mirror the same three-card layout in `HrFinalizationSheet.tsx`
- Same conditional-cards treatment so HR/Admin sees a consistent, non-misleading view of a system-only review.

## Out of scope
- No changes to `advance_annual_review_status`, `hydrate_annual_review_system_scores`, `annual_review_compute_final_summary`, or any migration.
- No change to badge thresholds or the "Outstanding / Good / Poor" mapping.

## Risk & impact
- **Data**: none — read-only presentation changes.
- **Workflow**: none.
- **Regression risk**: low, isolated to two components; existing criteria-only templates continue to render exactly as today (both cards, criteria x / 5 hint preserved — moved to Total).
- **Rollback**: revert the two component edits.
