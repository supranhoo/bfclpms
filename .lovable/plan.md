
## Root cause

TEST003's template (`af2a2c7c…`) has 5 required `self_review_fields`
("best work", "daily problems", "needs", "shop floor", "new skill"). Two
surfaces render the self-stage form:

- `src/pages/annual-review/EmployeeAnnualReview.tsx` — renders the
  "Qualitative Responses" card (lines 242-263). ✅
- `src/components/annual-review/TeamReviewDetailContent.tsx` — the
  page mounted at `/annual-review/team/:id` (the URL you're on).
  It renders SystemScores + Criteria only. It **never renders
  `template.sections.self_review_fields`**. ❌

Because you're submitting TEST003's self review as a proxy from
`/annual-review/team/e35bbe35-…`, the last segment of the template is
invisible — the code path simply doesn't include it. It's not an RLS
issue, not template data, and not the pilot gate.

Same gap also affects **downstream reviewers** (manager / skip / dept /
BU / HR): they never get to read the employee's qualitative answers on
the review detail page — a visibility loss that partially explains
earlier "why can't Rupesh see…" reports.

## Risk & Impact Report

- **Data**: no schema / RLS / RPC change. Purely UI — writes into the
  existing `qualitative_responses` jsonb column on
  `annual_review_responses` that `EmployeeAnnualReview` already uses.
- **Workflow**: proxy self-submission via `AssistedSubmissionDialog`
  now includes the required qualitative answers before "Verify &
  Submit on behalf" advances the stage. Prevents empty submissions on
  required fields.
- **UI/UX**: adds one card ("Qualitative Responses") between
  Criteria and the footer on `/annual-review/team/:id`. Editable in
  proxy self mode; read-only for every downstream reviewer role so they
  can read the employee's answers.
- **Regression risk**: low — additive card, gated on
  `self_review_fields.length > 0`, reuses the exact draft/persist
  plumbing already wired for `qualitative_responses`.
- **Scalability**: 5 short textareas, no queries added.
- **Rollback**: revert the single component change; no data migration.

## Plan (surgical)

1. **Extract SSOT** —
   `src/components/annual-review/SelfReviewFieldsCard.tsx`:
   - Props: `fields`, `values`, `readOnly`, `onChange(id, txt)`,
     `translations`, `lang`, `defLang`, `displayMode`, `enableAudio`.
   - Renders the same "Qualitative Responses" card currently inlined
     in `EmployeeAnnualReview` (label + SpeakButton + Textarea,
     required-asterisk, `tField` translation fallback). Zero visual
     change on the employee page.

2. **EmployeeAnnualReview.tsx** — replace the inline block
   (lines 242-263) with `<SelfReviewFieldsCard …>`. Identical output.

3. **TeamReviewDetailContent.tsx** — after the criteria card, render
   `<SelfReviewFieldsCard>` when
   `(template?.sections.self_review_fields ?? []).length > 0`, with:
   - `readOnly = role !== 'self' || !!locked` — editable only in
     proxy-self mode, otherwise a read-only view of the employee's
     answers so every downstream reviewer can read them.
   - `values` bound to `draft.qualitative_responses` when
     `role === 'self'` (writes flow through the same
     `useDebouncedResponseDraft` already in place); otherwise bound to
     the self responder's saved `qualitative_responses` from
     `responses.find(r => r.reviewer_role === 'self')`.
   - `onChange` wired only when editable; otherwise `undefined`.

4. **SelfReviewSummaryDialog** already surfaces these fields on
   submit — no change needed.

5. **Docs & policy sync** (SSOT rule):
   - `DOCUMENTATION.md` → new version-history entry: "Self-review
     qualitative fields now render on `/annual-review/team/:id` in
     proxy-self mode (editable) and downstream stages (read-only).
     Fixes missing last segment for TEST003 template."
   - `POLICY.md` → under §AR-SELF-QUALITATIVE add: "Any surface that
     accepts self-stage input MUST render every
     `template.sections.self_review_fields`. Downstream reviewer
     surfaces MUST render them read-only so context is preserved."

6. **Tests** (Vitest, additive):
   - `SelfReviewFieldsCard.test.tsx` — renders each field, shows
     required asterisk, respects `readOnly`, calls `onChange` with
     `(id, value)`, hides when list is empty.
   - Extend `TeamReviewDetailContent`-adjacent test (or add a new
     integration-style test with a mock template + `role='self'` +
     `proxyMode=true`) to assert the card is present and editable.
   - Regression test to assert the card is **read-only** when
     `role='manager'` and a self response exists.

## Technical notes

- Reuse existing `useDebouncedResponseDraft` — no new persistence.
- `SpeakButton` + `tField` behaviour is preserved by moving the exact
  function into the new component (or accepting a prebuilt
  translator prop).
- No change to `advance_annual_review_status`, RLS, or the pilot
  `AnnualReviewGate`.
- Zero-hardcoding respected — everything driven by
  `template.sections.self_review_fields`.

## Files touched

- **new** `src/components/annual-review/SelfReviewFieldsCard.tsx`
- **new** `src/components/annual-review/SelfReviewFieldsCard.test.tsx`
- **edit** `src/pages/annual-review/EmployeeAnnualReview.tsx`
  (swap inline block for the new component)
- **edit** `src/components/annual-review/TeamReviewDetailContent.tsx`
  (render the card; editable in proxy-self, read-only elsewhere)
- **edit** `DOCUMENTATION.md`, `POLICY.md`

## Verification

- Reload `/annual-review/team/e35bbe35-…` as the proxy submitter →
  see the new "Qualitative Responses" card with the 5 questions,
  editable, required asterisks visible. Fill in, Save draft, then
  "Verify & Submit on behalf" → the answers land in
  `annual_review_responses.qualitative_responses` for the self row.
- Reload as Rupesh (Dept Head) once the review is at `pending_dept`
  → same card visible but read-only, showing the employee's answers.
- `bun test` → new tests green; existing self-review tests still
  green.
