## Root cause analysis

**Instance queried (TEST003 → `e35bbe35…`).** The DB truth is `overall_status = 'pending_self'`. Timeline reconstructed from `system_audit_logs`:

| UTC | Event | Effect |
|---|---|---|
| 07-03 13:05 | Template override + `enabled_stages_set` → `[self, dept_head, bu_head, hr]` | status retargeted to `pending_self` |
| 07-03 14:05 | `annual_review.send_back` (dept_head → self, by manager `535d…`) | status → `pending_self` |
| 07-04 14:13 | Proxy submit (`submit_annual_review_self_as_proxy`) | status → `pending_dept`, `submitted_via_proxy=true`, `proxy_submission_id` stamped |
| 07-04 14:59:18 | `annual_review.send_back` (dept_head → self, again) | status → `pending_self`, self-response `is_locked=false`, `submitted_at=NULL` |
| 07-04 14:59:41 / 14:59:49 | template override toggles | only allowed while status = `pending_self` (proves the send-back landed) |

So the employee view is correct. The manager view is wrong because of **two independent defects** in the send-back RPC and the badge logic. The stepper/badge you saw (`Dept Head Review Pending` + `Submitted with assistance`) is being derived from stale proxy-state fields that send-back never resets.

### Defect 1 — send-back does not clear proxy flags (DB layer)

`public.send_back_annual_review_status` (migration `20260621064230…`, lines 275-331) updates `overall_status`, unlocks the previous-role response, but leaves `submitted_via_proxy` and `proxy_submission_id` untouched. After a send-back to `self` the instance carries `overall_status='pending_self'` **with `submitted_via_proxy=true`** — an impossible state that misleads every downstream reader.

### Defect 2 — badge is derived from the stale flag, not the current response (UI layer)

`TeamReviewDetailContent.tsx` (~L245-249) shows the "Submitted with assistance" badge whenever `instance.submitted_via_proxy` is true, regardless of whether the self-response is currently locked/submitted. Combined with defect 1 the badge outlives the actual proxy submission.

### Defect 3 — reviewer-queue detail hydration path can serve a pre-send-back snapshot

`useReviewInstance` invalidates on `annualReviewKeys.all`, so a plain refetch works; however the paginated queue (`useInstancesPaginated`, key `[...all, 'instancesPaginated', args]`) caches the row and `keepPreviousData` shows the pre-send-back status until the next fetch cycle completes. That's the "manager sees `pending_dept`" symptom on the queue list even though the detail page refetches. This is a UX layer only — the DB is already correct.

## Fix plan (surgical, no schema change)

1. **DB — `send_back_annual_review_status` (new migration)**
   Add `submitted_via_proxy = false, proxy_submission_id = NULL` to the UPDATE **only when `v_prev_role = 'self'`** (i.e., send-back is dropping the review back into self-review). All other send-back targets are unaffected. The proxy audit row in `annual_review_proxy_submissions` is **not** deleted — history stays intact; the instance-level flag reflects the *current* state only.

2. **DB — one-time repair for instances currently in this bad state**
   ```sql
   UPDATE public.annual_review_instances
      SET submitted_via_proxy = false, proxy_submission_id = NULL
    WHERE overall_status = 'pending_self'
      AND submitted_via_proxy = true;
   ```
   Included in the same migration. Non-destructive: only clears flags whose invariant is already violated.

3. **UI — badge & assisted-mode gating (`TeamReviewDetailContent.tsx`)**
   Compute `isCurrentlyProxySubmitted = instance.submitted_via_proxy && selfResponse?.is_locked === true && !!selfResponse?.submitted_at`. Use that (not the raw flag) for:
   * "Submitted with assistance" badge visibility.
   * Any downstream gating that assumes the self-stage was actually completed via proxy.

4. **Queue refresh — `useSendBackStatus` (`src/hooks/useAnnualReview.ts`)**
   Keep the `annualReviewKeys.all` invalidation and additionally call `qc.refetchQueries({ queryKey: annualReviewKeys.all, type: 'active' })` so the visible queue (using `keepPreviousData`) refetches immediately instead of on next mount.

5. **Tests (mandatory)**
   * `src/test/annualReview/sendBackClearsProxyFlags.test.ts` — unit test around a fake instance to assert the new send-back branch clears both fields only when target=self.
   * Update `src/test/annualReview/proxySubmission.test.ts` — add case "after send-back to self, badge/mode do not treat instance as proxy-submitted".
   * SQL regression: extend an existing PL/pgSQL test (or add a small `.sql` test invoked from CI) exercising proxy-submit → send-back → assert `submitted_via_proxy=false, proxy_submission_id IS NULL, overall_status='pending_self'`.

6. **Docs & policy**
   * `DOCUMENTATION.md` — new subsection under Annual Review > Send-Back: "Send-back to self also clears proxy flags."
   * `POLICY.md` §AR-SELF-QUALITATIVE (or new §AR-PROXY-STATE) — invariant: `submitted_via_proxy=true` requires the current self-response to be locked & submitted. Any transition that reopens the self-response MUST clear the flag.

## Risk & Impact

* **Data:** Additive fix; no schema change, no destructive deletes. Repair UPDATE only touches rows already violating the invariant.
* **Workflow:** Unchanged — send-back semantics preserved for every non-self target.
* **UI/UX:** Badge disappears once a review is legitimately back in `pending_self`; queue refresh becomes eager on send-back.
* **Regression risk:** Low. Behavior for the "self was truly submitted via proxy" happy path is unchanged.
* **Rollback:** Revert the new migration (re-`CREATE OR REPLACE` the previous body); revert the small UI/hook diff. The one-time repair is idempotent and does not require rollback.

## Files to touch

* `supabase/migrations/<new>_send_back_clears_proxy_state.sql` — RPC re-definition + one-time repair
* `src/components/annual-review/TeamReviewDetailContent.tsx` — badge gating
* `src/hooks/useAnnualReview.ts` — eager refetch on send-back
* `src/test/annualReview/sendBackClearsProxyFlags.test.ts` (new) + updates to `proxySubmission.test.ts`
* `DOCUMENTATION.md`, `POLICY.md`

No changes to `EmployeeAnnualReview.tsx`, `stageChain.ts`, or the proxy-submit RPC.