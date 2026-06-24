## Confirmation

Yes, this is safe to hide. The placeholder card only renders when `shouldHideCriteriaCard(template, 'self')` is true — i.e. the template has zero criteria mapped to the Self stage. In that case the employee has nothing to score, so the card adds no value and can be suppressed.

The system-score panel, composition card, stage tracker, self-review fields (if any), evidence uploader, and the Submit button all sit OUTSIDE this block (see `EmployeeAnnualReview.tsx` lines 183–222) and are unaffected — the employee can still review system scores and submit.

## Change

`src/pages/annual-review/EmployeeAnnualReview.tsx` (lines 195–222):

- Replace the ternary with `{!shouldHideCriteriaCard(template, 'self') && ( <Card>…CriteriaScoringMatrix…</Card> )}`.
- Drop the placeholder `<Card>` and its `section.no_self_criteria` i18n string usage at this call site. (Leave the translation key in the i18n catalog for now — zero-cost, allows reuse if we ever want to re-enable it via a setting.)

## Risk & Impact

- **UI:** When a Self-stage template has no criteria, employees see one fewer card. Submit flow unchanged.
- **Workflow / scoring:** None. `criteriaForStage(template, 'self')` already returns `[]` in this case, so `computeCriteriaScore` returns 0 regardless.
- **Other stages:** Out of scope. Manager / Skip / Dept / BU / HR views are not touched.
- **Regression:** Minimal — single conditional render swap.
- **Rollback:** Re-introduce the placeholder card.

## Tests / Docs

- Extend the existing `EmployeeAnnualReview` render test (or add one) asserting: when `template.sections.criteria` has no `self`-stage rows, neither the placeholder card nor the matrix renders, and Submit is still present.
- DOCUMENTATION.md → add a v2.66.57 entry under the Annual Review section noting the empty-state suppression.
- POLICY.md → append a one-liner under the existing Annual Review section: "If a stage has no mapped criteria for the current viewer's role, that stage's criteria card MUST be omitted entirely — do not render a placeholder."

## Out of scope

- No change to Manager/Skip/Dept/BU/HR self-criteria empty-state handling. If you want symmetric behaviour for reviewer stages too, say the word and I'll extend it in the same patch.
