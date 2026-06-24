## Goal

Add a HR-authored **Policy Description** to each Eligibility Criterion, surface it (instead of raw `Condition` / `Expected`) on the employee-facing "Eligibility criteria not met" table, only highlight rows that actually fail in red, and require the eligibility-input submitter to record a **remark** when any criterion fails — that remark must be visible to the employee.

## Assumptions

- "Eligibility Criteria (HR Inputs)" = the template section authored in `TemplateEditorDialog.tsx`; the per-employee values live in `annual_review_instances.eligibility_inputs` and are entered via `EligibilityInputsEditor.tsx`.
- "Policy Description" replaces both `Condition` and `Expected` columns visually for the employee, but the underlying operator + expected_value are kept (used by `evaluateEligibility`). The description is the human-readable rule (e.g. "Absent days in FY must be less than 1").
- The remark is a single free-text field per instance ("eligibility remark"), not per criterion. It is mandatory only when at least one criterion fails at save time; otherwise optional.
- Employee view = `EmployeeAnnualReview.tsx` → `SystemScoresPanel` (where the red Alert table currently renders).

## Risk & Impact Report

- **Data**: adds `description?: string` to `EligibilityCriterion` (JSON shape inside `annual_review_templates.sections`); adds new nullable column `annual_review_instances.eligibility_remark text`. Both additive, backward-compatible. Existing templates without descriptions fall back to the current `operator + expected_value` text.
- **Workflow**: HR-input submission gains a remark field; validation blocks save when failures exist and remark is empty. No status-machine changes.
- **UI/UX**: editor gets one extra textarea per criterion row; HR inputs editor gets one new textarea below the grid; employee panel column header renames + only failing rows render red (passing-but-shown scenarios unchanged because the alert still only opens when `!passed`). All within existing cards — no layout/responsiveness regression.
- **Regression**: exports/bulk-templates currently iterate `eligibility_criteria` by `id/name` only — unaffected. `evaluateEligibility` unchanged. Migration is additive.
- **Scalability**: bounded N criteria per template (admin-authored), no query/list growth.
- **Mitigation**: keep fallback render when `description` missing; gate remark requirement client-side AND in `updateEligibilityInputs` (throw if failures exist and remark blank).
- **Rollback**: drop column and remove `description` field reads; UI falls back automatically.

## Plan

1. **Type + migration**
   - `src/types/annualReview.ts`: add `description?: string` to `EligibilityCriterion`; add `eligibility_remark?: string | null` to `AnnualReviewInstance`.
   - Migration: `ALTER TABLE public.annual_review_instances ADD COLUMN eligibility_remark text;` (nullable, no default; RLS unchanged, column inherits existing row policies).

2. **Template editor** (`TemplateEditorDialog.tsx`)
   - In the Eligibility table, add a new `Policy Description` column with a small `Textarea` (2 rows). Wire to `updateAt(..., 'eligibility_criteria', i, { description })`.
   - Keep existing Name/Type/Rule/Expected/Delete columns — they're still needed for evaluation.

3. **HR Inputs editor** (`EligibilityInputsEditor.tsx`)
   - Replace the `(operator expected)` label suffix with the authored `description` when present (falls back to current suffix).
   - Add an `eligibility_remark` Textarea below the grid. Compute live `evaluateEligibility` against current `values`; if any failure, mark the remark required (red asterisk + helper text "Required when criteria are not met").
   - On Save: if failures exist and remark is empty/whitespace → block + toast. Pass remark through.
   - Update `svc.updateEligibilityInputs(instanceId, values, remark)` signature.

4. **Service** (`annualReviewService.ts`)
   - `updateEligibilityInputs` accepts optional `remark: string | null`; updates both `eligibility_inputs` and `eligibility_remark` in one patch. Server-side guard: if any criterion fails and remark is empty, throw a typed error (defense in depth — UI also blocks).

5. **Employee panel** (`SystemScoresPanel.tsx`)
   - Rename the table to two columns: **Criterion** and **Policy Description** (render `criterion.description` if present, else legacy `${operator} ${expected_value}` fallback). Keep `Actual` column.
   - Only the failing rows render — that's already true (we only iterate `result.failures`) — so the red alert intrinsically highlights "only when not met". Add an "Eligibility Remark" block under the table when `instance.eligibility_remark` is set, styled inside the destructive alert.
   - Plumb `eligibility_remark` from `EmployeeAnnualReview.tsx` → `SystemScoresPanel` as a new optional prop.

6. **Tests + mocks**
   - `src/lib/annualReview/eligibility.test.ts`: extend cases with `description` field passing through (no eval impact).
   - New `src/components/annual-review/__tests__/EligibilityInputsEditor.test.tsx`: (a) save allowed when all pass with empty remark; (b) save blocked when a failure exists and remark is empty; (c) save succeeds when remark provided.
   - `src/services/annualReview/exports.test.ts`: ensure remark + description don't break the JSON export shape.

7. **Docs**
   - `DOCUMENTATION.md` v2.66.59: new schema column + UI changes + validation rule.
   - `POLICY.md` §AR-ELIGIBILITY-REMARK: "When any HR-input eligibility criterion fails, the submitter MUST record an Eligibility Remark; the remark is rendered to the employee inside the destructive eligibility alert. Criterion authoring may include a Policy Description that replaces the operator/expected pair in the employee-facing table."

## UI Changes

- **Template editor → Eligibility section**: extra "Policy Description" textarea column per row.
- **HR Inputs editor**: each field's helper label uses `description` when present; new "Eligibility Remark" textarea below the grid with required-when-failing validation.
- **Employee Annual Review → System Scores card → Eligibility alert**: columns become `Criterion | Policy Description | Actual` (red text retained); a new "Remark from HR" line appears under the table inside the same red alert when present.

## Out of Scope

- No change to `evaluateEligibility` math.
- No per-criterion remarks (single instance-level remark only).
- No notification dispatch on remark changes.

## Rollback

- Drop the migration column.
- Remove the `description` and `eligibility_remark` reads in the three files above — UI silently reverts to the current operator/expected rendering.
