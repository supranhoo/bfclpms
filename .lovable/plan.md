## What we know (verified)

- DB: instance `95fa23c0-2eea-4b52-b159-2a0b6af32fda` for Shubham Kumar (100807) is `pending_self`. `annual_review_responses(self)` row: **all 12 criteria scored**, qualitative filled, `is_locked=false`, `submitted_at=NULL`.
- UI code path (`EmployeeAnnualReview.tsx` L71) correctly evaluates `locked = false` for this state, so the criteria matrix is *supposed* to be interactive.
- User symptom: on Shubham's screen the radio options for each criterion **appear unselected** even though the chip shows `Self: 5`, and **clicks on the radio options don't register** ("mouse is getting blocked"). Because nothing appears selected, our client-side "all criteria scored" precondition inside `SelfReviewSummaryDialog` / submit never lets him confirm — hence no `advance_annual_review_status` call ever hits the server.

## Root-cause hypothesis (unconfirmed — Step 1 verifies)

The `CriteriaScoringMatrix` radio state is not being seeded from `draft.criteria_scores`. Two candidate causes:

1. **Value-type mismatch** — draft stores `5` (number) but `RadioGroup value` is compared as string, so no option is `checked` and the pointer target ends up on an inert wrapper.
2. **Overlay covering the tiles** — a `pointer-events`/`z-index` regression from a recent sticky-footer / composition-card change is sitting over the option cards, so clicks never reach the radio inputs.

Either way the visible result is: chip shows saved value, tiles look empty, clicks do nothing, Submit stays disabled.

## Plan

1. **Reproduce as Shubham via Playwright** using the injected session (localhost:8080, his instance URL). Screenshot the self-review page; DOM-inspect one criterion tile to confirm which of the two hypotheses is real (check `aria-checked`, computed `pointer-events`, and elementFromPoint at the radio center).
2. **Fix the actual cause** in `src/components/annual-review/CriteriaScoringMatrix.tsx` (and, if needed, the wrapping card in `EmployeeAnnualReview.tsx`):
   - If (1): normalise stored/compared values to the same type (coerce to `String(value)` on both sides of `RadioGroup`) and add a regression test with a numeric-keyed draft.
   - If (2): remove/relax the offending `pointer-events`/absolute overlay; add a Playwright test that clicks each option and asserts `aria-checked`.
3. **Data hygiene for 100807**: none needed — his draft row already has valid scores. Once the UI is fixed he can click Submit; server RPC is healthy.
4. **Regression coverage**: unit test for the matrix binding (numeric vs string keys) + one interaction test that a click on an option updates state.
5. **Docs**: append ADR-119 (CriteriaScoringMatrix interaction regression) to `src/modules/annual-review/DOCUMENTATION.md`; no POLICY.md change (no business-rule change).

## Risk & impact

- Data: none — read-only UI fix + client state binding.
- Workflow: unblocks any employee in `pending_self` whose draft was pre-seeded with numeric scores (potentially all of them if hypothesis 1 is right — will confirm in Step 1 and report the blast radius before shipping).
- Rollback: pure component change, revert-safe.

## Deliverable back to you

Step 1 output (screenshot + DOM evidence) posted in chat before I ship the fix, so you can confirm the diagnosis matches what Shubham sees.