# Plan: Fix self-review option card multi-selection

## Assumptions
- The screenshot is from the annual review self-review criteria scoring card.
- The affected criterion is **FAD - E&I KPI & Target Achievement** in template **FAD- M - E&I**.
- The correct business scoring should be descending from best to worst: **5, 4, 3, 2, 1, 0**.

## RCA
- The UI currently marks an option selected using the numeric score: `active = currentScore === option.score`.
- Backend data check found this criterion has six options, and **all six are stored as `score: 0`**.
- Therefore, when score `0` is selected or loaded, every option matches `currentScore === 0`, so all six cards show the selected tick.

## Risk & Impact Report
- **Data Impact:** Targeted repair to one annual review template criterion only. No historical score recalculation will be done automatically.
- **Workflow Impact:** No review stage, permission, or approval workflow change.
- **UI/UX Impact:** Only the option-card selected state changes; one option will show selected instead of all matching-score cards.
- **Regression Risk:** Low, but option cards with duplicate scores are a known edge case.
- **Scalability Impact:** No large dataset loading or pagination change; only one JSON template row is repaired.
- **Mitigation Plan:** Add regression tests for duplicate-score options and hydrated existing score values.

## Step-by-step Plan
1. **Repair incorrect template data**
   - Add a targeted backend migration to update the affected criterion options:
     - Exceptional achievement → 5
     - 95–100% → 4
     - 90–95% → 3
     - 80–90% → 2
     - 70–80% → 1
     - <70% → 0
   - Include a backup/audit row before modifying the JSON template data if the existing project pattern supports it.

2. **Harden the UI selection logic**
   - Update `CriteriaScoringMatrix.tsx` so option-card selection is tracked by option identity for the current session, not only by numeric score.
   - Keep persisted scoring unchanged: save only the numeric option score, so existing annual-review scoring logic remains compatible.
   - When opening an existing saved response, select only the first matching score option instead of all matching options.

3. **Add admin authoring warning**
   - In the criterion option editor, show an inline warning when multiple options share the same score.
   - This prevents another all-zero option set from being missed during template authoring.

4. **Regression tests**
   - Add/extend tests proving that duplicate-score options only highlight one selected card.
   - Add a hydration test proving existing numeric values show one selected card.
   - Add a data-contract test for the repaired criterion score sequence where feasible.

5. **Documentation / Policy sync**
   - Update annual-review documentation version history with the RCA and fix.
   - Add a policy note that option-card scores should be unique unless deliberately authored, and duplicate scores must show a warning.

## UI Changes
- **Location:** Annual review self-review score card option grid.
- **Visual change:** Only one card will display the selected ring/tick.
- **Interaction impact:** Clicking one option deselects the previous option visually.
- **Responsiveness:** No layout change; existing grid remains unchanged.

## Rollback Strategy
- Revert the migration or restore the previous `sections` JSON from backup/audit row.
- Revert the UI change to score-based active state if needed.

## Tests
- Run the relevant annual-review component tests after implementation.
- Verify the self-review page visually after applying the fix.