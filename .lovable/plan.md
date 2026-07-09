## Gap

The eligibility table exposes raw evaluator internals in two columns:

- **Policy Description** shows `lt 1`, `gte 6`, `equals false` when no description text was configured.
- **Expected** always shows the operator + value literal (`lt 1`, `gte 6`, `equals false`).

These are backend syntax (operator enum + threshold), not language a reviewer, employee, or HR user can read at a glance. The screenshot the user shared confirms it: "lt 1", "lt 30", "equals false", "gte 6" bleed through into the UI even when every criterion has already been met.

The evaluator (`lib/annualReview/eligibility.ts`) still needs the operator + value to compute pass/fail — that logic stays. Only the rendered strings change.

## Fix Plan (UI-only, no logic/schema changes)

### 1. New helper: `src/lib/annualReview/eligibilityFormat.ts`

Pure formatter that turns `(operator, expected_value, type)` into a plain-English phrase. No dependencies on React or the evaluator.

Mapping (used for both Expected and the Policy Description fallback):

| Operator | number/text | boolean (expected = true) | boolean (expected = false) |
|---|---|---|---|
| `equals` | `= {value}` | `Yes` | `No` |
| `not_equals` | `≠ {value}` | `Not Yes` | `Not No` |
| `gte` | `At least {value}` | — | — |
| `gt`  | `More than {value}` | — | — |
| `lte` | `At most {value}` | — | — |
| `lt`  | `Less than {value}` | — | — |

Also exports `formatActual(value, type)` — renders booleans as **Yes / No** (instead of `true`/`false`) and leaves numbers/strings as-is; returns `'—'` for null/empty.

Both helpers are i18n-key aware: they call `t('eligibility.expected.<operator>', fallback)` when a translator is passed in, otherwise fall back to the English string. Keeps the panel's existing `useAnnualReviewI18n` pattern intact.

### 2. `SystemScoresPanel.tsx` — swap the two cells

- **Policy Description cell** (line 233–237): keep the translated `description` when present; when absent, call `formatExpected(c)` instead of the raw `${operator} ${expected_value}` fallback.
- **Expected cell** (line 238–240): replace `${c.operator.replace(/_/g,' ')} ${String(c.expected_value)}` with `formatExpected(c)`.
- **Actual cell** (line 241–247): route the value through `formatActual(actual, c.type)` so booleans show as Yes/No and align with Expected.

No other component consumes these strings, so the change is contained.

### 3. `EligibilityInputsEditor.tsx` — same treatment for the HR editor

Line 87–92 currently shows `({operator} {expected_value})` as the fallback hint next to each field. Swap it for `formatExpected(c)` so HR sees the same human-readable phrase they'll show to employees.

### 4. i18n keys added (English defaults)

```
eligibility.expected.equals            = "= {value}"
eligibility.expected.not_equals        = "≠ {value}"
eligibility.expected.gte               = "At least {value}"
eligibility.expected.gt                = "More than {value}"
eligibility.expected.lte               = "At most {value}"
eligibility.expected.lt                = "Less than {value}"
eligibility.expected.bool_true         = "Yes"
eligibility.expected.bool_false        = "No"
eligibility.expected.bool_not_true     = "Not Yes"
eligibility.expected.bool_not_false    = "Not No"
eligibility.actual.yes                 = "Yes"
eligibility.actual.no                  = "No"
```

### 5. Tests

- **New** `src/test/annualReview/eligibilityFormat.test.ts` — covers every operator × type combination, boolean rendering, and the null/empty actual case.
- **Update** `src/test/annualReview/systemScoresPanel.eligibility.test.tsx` — assert the table renders `At least 90` (not `gte 90`), `No` (not `false`) for the disciplinary row, and `—` when input is missing.

### 6. Docs

- `DOCUMENTATION.md` → Annual Review > Eligibility: note that Expected/Actual/Policy Description are rendered in plain language; evaluator internals never surface in the UI.
- `POLICY.md` → extend `§AR-ELIGIBILITY-ALWAYS-VISIBLE` with a sub-clause: *"Eligibility criteria must be displayed in human-readable language. Operator enums (`gte`, `lt`, `equals`) and raw boolean literals (`true`/`false`) must never appear in the UI."*

## Risk & Impact

- **Data**: none — pure presentation change; evaluator, persistence, and scoring untouched.
- **Workflow**: none — pass/fail logic unchanged.
- **UI**: three cells + one HR editor hint now show plain-English phrasing.
- **Regression risk**: low — single new pure helper, two consumer files. Existing eligibility test suite continues to pass because operators still evaluate identically.
- **Rollback**: revert the two consumer diffs and delete the helper.

## Out of Scope

- Evaluator, scoring, bulk upload, template authoring, and HR editor value inputs.
- Alternate phrasings per template (would require template-level copy override — separate feature).
