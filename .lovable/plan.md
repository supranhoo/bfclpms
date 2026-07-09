## Gap

The eligibility table currently shows two columns that convey the same information:

- **Policy Description** — falls back to `formatExpected(c)` when no description is authored, so it repeats the Expected column verbatim (`Less than 1`, `No`, `At least 6`).
- **Expected** — always shows the plain-English rule.

Since we standardized on plain-English rendering, the Policy Description column no longer adds value — it's either identical to Expected (fallback case) or a longer restatement (authored case). The rule name is already carried by the **Criterion** column (e.g., "Absent Days ( 0 Absent Days Effective from 1st January)").

## Fix (UI-only)

### 1. `SystemScoresPanel.tsx` — remove the Policy Description column

- Delete the `<TableHead>Policy Description</TableHead>` header cell.
- Delete the corresponding `<TableCell>` in the row body (the one rendering `description` / `formatExpected(c)` fallback).
- Table becomes 4 columns: **Criterion | Expected | Actual | Status**.
- Keep the `description` field on the type — still used by the HR editor (`EligibilityInputsEditor.tsx`) as an inline hint next to the field label.

### 2. Tests

Update `src/test/annualReview/systemScoresPanel.eligibility.test.tsx`:
- Remove any assertion tied to the Policy Description cell (if present).
- Add a regression assertion: table headers do not include "Policy Description".
- Keep all existing status/plain-language assertions.

### 3. Docs

- `DOCUMENTATION.md` → note v2.66.94: eligibility table simplified to 4 columns; Policy Description removed as redundant with Expected.
- `POLICY.md` → extend `§AR-ELIGIBILITY-ALWAYS-VISIBLE` sub-clause: "Do not duplicate the Expected rule in a separate column; the criterion name carries the policy label, Expected carries the rule."

## Risk & Impact

- **Data**: none — pure presentation.
- **Workflow**: none — evaluator, scoring, remarks, and HR editor unchanged.
- **UI**: eligibility table drops one column; row height and layout tighten.
- **Regression risk**: very low — no other component reads that cell.
- **Rollback**: revert the single component diff.

## Out of Scope

- HR editor hint (already uses `description` when present).
- Evaluator, scoring, upload, template authoring.
