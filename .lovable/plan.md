## Gap

`SystemScoresPanel.tsx` (line 134) renders the eligibility section **only when `!result.passed`** — the destructive Alert with the criteria table appears exclusively for failures. When every criterion is met, the panel renders nothing about eligibility, so employees, managers, skip-level, BU, and HR viewers lose sight of the year-long behavioural expectations that the section was designed to reinforce.

Affected surfaces (all consume the same panel):
- Employee self-review page (`EmployeeAnnualReview.tsx`)
- Team reviewer detail (`TeamReviewDetailContent.tsx`)
- HR finalization sheet (`HrFinalizationSheet.tsx`) — display half; the editor already renders unconditionally

## Fix Plan (UI-only, no logic/schema changes)

Make the eligibility section **always visible** whenever the template defines any `eligibility_criteria`, and use styling to convey status instead of visibility.

### 1. `src/components/annual-review/SystemScoresPanel.tsx`
- Replace the `result && !result.passed` gate with an unconditional block rendered whenever `eligibility?.length > 0`.
- Render a single card/section titled **"Eligibility Criteria"** with a status chip:
  - All met → green "All criteria met" badge
  - Any failure → existing destructive "Eligibility criteria not met" badge
  - Any criterion with no input yet → neutral "Pending inputs" badge
- Table columns: Criterion · Policy Description · Expected · Actual · Status (✓ / ✗ / —).
  - Row tint: subtle green on pass, destructive tint on fail, neutral on pending.
- Keep the HR Remark block exactly as-is but show it only when a remark exists (unchanged behaviour).
- Preserve all i18n keys (`eligibility.title`, `eligibility.col.criterion`, `eligibility.col.policy_description`, `eligibility.col.actual`, `eligibility.remark_label`) and add two new keys: `eligibility.col.expected` ("Expected"), `eligibility.col.status` ("Status"), `eligibility.status.met` ("All criteria met"), `eligibility.status.pending` ("Pending inputs").

### 2. No changes required in
- `EligibilityInputsEditor.tsx` (HR editor already always visible when criteria exist).
- `EmployeeAnnualReview.tsx`, `TeamReviewDetailContent.tsx`, `HrFinalizationSheet.tsx` — they already pass `eligibility`, `eligibilityInputs`, `eligibilityRemark` through.
- `lib/annualReview/eligibility.ts` — evaluator is unchanged; we just consume `result.failures` and derive per-row status.

### 3. Tests
- New `src/test/annualReview/systemScoresPanel.eligibility.test.tsx`:
  - Renders the criteria table when all criteria pass (regression lock for this fix).
  - Renders destructive header when any criterion fails.
  - Renders neutral "Pending" state when an input is missing.
  - Hides the whole block when `eligibility` is empty/undefined.
- Extend `templateVisibility.test.ts` note — no code change needed there.

### 4. Docs
- `DOCUMENTATION.md` → Annual Review > Eligibility section: document "always visible" behaviour and the three status states.
- `POLICY.md` → add `§AR-ELIGIBILITY-ALWAYS-VISIBLE`: "Eligibility criteria list is a year-round reference; the section renders whenever the template defines criteria, regardless of pass/fail status."

## Risk & Impact

- **Data**: none — read-only display change.
- **Workflow**: none — evaluator, gating, scoring untouched.
- **UI**: adds a persistent panel on 3 surfaces where it was previously hidden on the happy path. Vertical space grows by one card on passing instances. Mobile: single-column table already used.
- **Regression risk**: low. The destructive failure UI is preserved; we only widen the render condition.
- **Rollback**: revert the SystemScoresPanel diff; single-file change.

## Out of Scope

- No changes to eligibility evaluation, scoring, or persistence.
- No changes to bulk upload, templates, or HR editor.