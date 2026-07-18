
## RCA — Employee 100851 (and 1,533 others)

The HR team member's report is genuine. For instance `92c1d615…` (Awadh Bihari Lal, 100851) the self response row is present with **10 criteria scores + 5 qualitative responses saved**, yet the dialog blocks with "Save the employee's self scores first…". Same pattern exists for **1,533 of 1,552 unsubmitted self responses** system‑wide.

### 5‑Why

1. Why did the dialog block? The client guard `hasScoredSelf` checks `weighted_score IS NOT NULL`, and it is `NULL`.
2. Why is `weighted_score` null even though 10 criteria are filled? Draft auto‑save (`useDebouncedResponseDraft` → `upsertResponseDraft`) never sets `weighted_score`. The comment in `EmployeeAnnualReview.tsx:161` says "weighted_score is computed server‑side inside `advance_annual_review_status`".
3. Why isn't the proxy path computing it? `submit_annual_review_self_as_proxy` only locks the row and advances status — it never calls `compute_annual_review_weighted_score`, unlike `advance_annual_review_status`.
4. Why did my previous ADR‑114 guard pick `weighted_score`? I chose the wrong signal — I assumed drafts populated it. They don't.
5. Why wasn't this caught in tests? Existing regression tests assert the guard *exists*, not that it correctly represents "form has scores". No test used a realistic draft (criteria filled, weighted_score null) to reproduce HR's flow.

**Root cause (single sentence):** the assisted‑submit guard reads a field that only the *self* submit path ever writes, so any proxy submission after a draft save is impossible.

## Risk & Impact

- **Data:** 1,533 unsubmitted self responses are currently un‑submittable via assisted flow. No data loss — pure UX/RPC block.
- **Workflow:** HR/authorized proxies cannot advance any of those employees; queues will keep piling.
- **Regression risk:** must NOT reopen the original ADR‑114 bug (advancing an *empty* form). New guard must still refuse when zero criteria are scored.
- **Rollback:** additive — old RPC signature preserved; migration is safe to re‑apply.

## Fix Plan

### 1. Server (SSOT, migration)

Redefine `public.submit_annual_review_self_as_proxy`:
- Replace the `weighted_score IS NOT NULL` gate with a "has ≥1 numeric criterion score" check using `jsonb_each(criteria_scores)`.
- After the gate passes, call `public.compute_annual_review_weighted_score(p_instance_id,'self')` and write it onto the response so downstream reports mirror the normal self path (parity with `advance_annual_review_status`).
- Keep the `proxy_submit_requires_self_scores` error name and HINT so existing UI copy still applies for the true empty case.

Also add a one‑shot backfill inside the same migration:
```sql
UPDATE annual_review_responses r
   SET weighted_score = public.compute_annual_review_weighted_score(r.instance_id,'self')
 WHERE r.reviewer_role = 'self'
   AND r.weighted_score IS NULL
   AND jsonb_typeof(r.criteria_scores) = 'object'
   AND (SELECT count(*) FROM jsonb_object_keys(r.criteria_scores)) > 0;
```
Idempotent, only touches rows that already had human input.

### 2. Client guard parity

`src/components/annual-review/AssistedSubmissionDialog.tsx` — replace the `weighted_score IS NOT NULL` count query with a fetch of `criteria_scores` and a helper `hasAnyNumericCriterion(obj)` that returns true when any value is a finite number. Keep the loading state, hint text and disabled logic unchanged.

### 3. Documentation & policy

- `docs/adr/ADR-115.md` — supersedes ADR‑114 with corrected signal.
- `POLICY.md` — update `§AR-ASSISTED-SUBMIT-GATE` to state: "Assisted submit is permitted iff the self response contains at least one numeric criterion score. Weighted score is (re)computed server‑side at submit time."
- `DOCUMENTATION.md` — Version History entry v2.66.115.

### 4. Tests

- `src/test/annualReview/assistedSubmitGuard.test.ts` — pure unit test for `hasAnyNumericCriterion` covering: empty object, all‑null values, one numeric, string values, `0` counts as scored.
- Extend `src/test/annualReview/proxySubmissionOptionalSelfie.test.ts` — assert dialog no longer references `weighted_score` in its guard query.
- New SQL regression note: seed a response with `criteria_scores = {"a":3}` and `weighted_score = NULL`, expect the RPC to succeed and set `weighted_score` non‑null.

### 5. Verification

After migration:
- Re‑query instance `92c1d615…` → expect `weighted_score` populated.
- `SELECT count(*) …` should drop from 1,533 → 0 for "null_ws with filled criteria".
- Manual: reopen dialog for 100851, expect Verify & Submit enabled once a photo/selfie is provided.

## UI Changes

Only the disabled‑state hint on the Assisted Submission dialog changes behaviour — it will now correctly disappear once the employee's self form has any scored criterion. No visual redesign.

## Files touched

- `supabase/migrations/2026071812xxxx_ar_proxy_guard_uses_criteria.sql` (new)
- `src/components/annual-review/AssistedSubmissionDialog.tsx`
- `src/lib/annualReview/hasScoredSelf.ts` (new, pure helper)
- `src/test/annualReview/assistedSubmitGuard.test.ts` (new)
- `src/test/annualReview/proxySubmissionOptionalSelfie.test.ts` (update assertion)
- `docs/adr/ADR-115.md`, `POLICY.md`, `DOCUMENTATION.md`

## Not applicable

Storage, auth, RLS, external APIs — unchanged.
