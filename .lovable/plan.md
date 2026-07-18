## What's actually broken

Employee **101165 (Bhola Pandit)** — and **23 other employees** — are stuck at `overall_status = pending_dept` with **no `annual_review_responses` row at all** for the `self` stage. All 24 have `enabled_stages = [self, dept_head, bu_head]` and all have a matching row in `annual_review_proxy_submissions`. Concretely, the DB shows: instance advanced past self, `total_score = NULL`, no self response, but a proxy audit row exists.

Affected (24, most recent first): 101165 Bhola Pandit, 101154 Anwarul Haque, 100142 Gopal Lohara, 100777 Ajay Kumar Tiwary, 101820 Swapan Mahato, 101288 Sanny Kumar Singh, 100678 Naushad Alam Khan, 100889 Md Tabir Ansari, 100340 Santosh Thakur, 101153 Md. Aman Ansari, 100788 Pavan Gope, 100782 Vishal Bedia, 100645 Sanjay Kumar Mahto, 100610 Manoj Bedia, 100521 Ganesh Munda, 100528 Rajesh Bedia, 101901 Adesh Munda, 101674 Md Shaukat Ali, 100942 Sonu Raj, 200201 Vikash Bediya, 200490 Sahil Bedia, 200330 Anoj Kumhar, 200396 Deepak Bediya, 200234 Ravi Bedia. Two proxy users produced the bulk of these (`56fab487…` and `6ef8b0f0…`).

## Root cause — 5 Whys

1. Why is the self stage blank? Because no `annual_review_responses` row was ever inserted for `reviewer_role = 'self'`.
2. Why did the instance still move to `pending_dept`? Because `submit_annual_review_self_as_proxy` calls `annual_review_next_status(...)` and updates `overall_status` **unconditionally**, regardless of whether a self response exists.
3. Why is there no self response to lock? Because `AssistedSubmissionDialog` → `submitWithAssistance` only writes an audit row + selfie/photo + calls the advance RPC. It does **not** capture or persist any criteria scores. The RPC's only touch on responses is `UPDATE ... SET is_locked = true, submitted_at = COALESCE(...)`, which no-ops when no row exists.
4. Why did the flow assume a self draft would already exist? Because the assisted flow was designed for the reviewer to first fill the scoring form (which autosaves a draft `annual_review_responses` row), then open the dialog to attach the selfie and submit. Proxies opened the dialog without ever touching the scoring form.
5. Why did the UI allow that? The "Assisted submission" entry point on the detail page does not require a saved self draft, and the RPC does not enforce it either — a double-missing guard.

**Root cause (single sentence):** `submit_annual_review_self_as_proxy` advances the stage without asserting that a self response with a non-null `weighted_score` exists, and `AssistedSubmissionDialog` doesn't require one either, so a proxy that skips the scoring form silently promotes the instance to `pending_dept` with zero self data.

## Impact

- 24 employees currently show no self scoring but sit at HOD stage. HOD can score on top, but the final rating will be computed against a missing self anchor and downstream reports (`get_annual_review_comprehensive_report`) render "—" for Self.
- Data-integrity risk: this can silently repeat for any proxy who forgets to fill the form first.
- No data loss on scores (there are none to lose); only workflow-state drift.

## CAPA

### 1. Data restoration (one-shot migration)

For every instance where `submitted_via_proxy = true` AND there is no `annual_review_responses` row with `reviewer_role='self'` AND `overall_status` is downstream of self:

- Regress `overall_status` back to `pending_self` via `annual_review_prev_status` semantics (only if no downstream reviewer has already submitted a response — safety guard).
- Keep the proxy audit row (append-only, per policy).
- Write a `system_audit_logs` entry `annual_review.proxy_submit.regress_missing_self` with the previous status and reason.
- Notify each affected proxy user (in-app notification: "Reopen Bhola Pandit to record self scores; earlier submission was accepted without scoring due to a bug").

### 2. Corrective — RPC hardening (`submit_annual_review_self_as_proxy`)

Add a precondition at the top of the function:

```sql
IF NOT EXISTS (
  SELECT 1 FROM annual_review_responses
  WHERE instance_id = p_instance_id
    AND reviewer_role = 'self'
    AND weighted_score IS NOT NULL
) THEN
  RAISE EXCEPTION 'proxy_submit_requires_self_scores'
    USING HINT = 'Fill and save the self scoring form before assisted submission.';
END IF;
```

This blocks any future proxy submit that hasn't captured self scores. Backwards compatible with the current UI flow when used correctly.

### 3. Preventive — UI guard in `AssistedSubmissionDialog`

- Before enabling the Submit button, fetch the current self response for the instance; if missing or `weighted_score IS NULL`, disable Submit and show inline copy: "Record the employee's self scores on the form below, then return here." Include a "Go to scoring form" link that scrolls to the self scoring section.
- On the entry point in `TeamReviewDetailContent.tsx`, gate the "Assisted submit" button with the same check — surface a tooltip when disabled.

### 4. Policy + docs

- **POLICY.md § AR-ASSISTED-SELF-SCORES-REQUIRED (new):** "Assisted (proxy) submission of the self stage MUST NOT advance the workflow unless a self `annual_review_responses` row with a non-null `weighted_score` exists. Enforced in the RPC and in the UI."
- **ADR-114:** captures RCA, 5-Whys, RPC + UI fix, restoration migration.
- Update `mem://features/annual-review/assisted-submission` to reference the new precondition.

### 5. Regression tests

- `src/test/annualReview/proxySubmitRequiresSelfScores.test.ts` — reads `submit_annual_review_self_as_proxy` definition, asserts the precondition string is present.
- `src/test/annualReview/assistedSubmissionDialogGuard.test.ts` — asserts the dialog disables Submit when no scored self response is loaded.
- Data-integrity check test: `SELECT count(*) FROM annual_review_instances i WHERE submitted_via_proxy AND NOT EXISTS (...)` must be 0 after restoration.

## Files to change

- `supabase/migrations/<new>_ar_proxy_require_self_scores.sql` — RPC redefinition + one-shot restoration UPDATE + audit log rows.
- `src/services/annualReview/proxySubmission.ts` — add `hasScoredSelfResponse(instanceId)` helper.
- `src/components/annual-review/AssistedSubmissionDialog.tsx` — precondition check, disabled state, inline copy.
- `src/components/annual-review/TeamReviewDetailContent.tsx` — gate the assisted-submit trigger.
- `src/test/annualReview/proxySubmitRequiresSelfScores.test.ts`, `src/test/annualReview/assistedSubmissionDialogGuard.test.ts` — new tests.
- `docs/adr/ADR-114.md`, `POLICY.md`, `mem://features/annual-review/assisted-submission` — docs + memory.

## Rollback

- Migration rollback file re-creates the previous `submit_annual_review_self_as_proxy` (without the precondition). Instances regressed by the restoration remain at `pending_self` — safe, since no scoring was overwritten.

## Risk

- Low. The RPC precondition tightens behavior; the UI change only disables a button when data is missing. Regression migration only rewinds instances that provably have no self response and no downstream response — checked case-by-case.
