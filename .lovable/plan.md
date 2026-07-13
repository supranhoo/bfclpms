## Root Cause (RCA)

The Self-Review "Submission Failed / new row violates row-level security policy for review_submissions" error keeps recurring because the submit path is **two client-side calls with an implicit ordering contract**, and any silent no-op on the first call breaks the second.

Today's flow (`useKpis.submitSelfReview`, POLICY §SELF-REVIEW-SUBMIT-ORDER):

1. `UPDATE kpis SET status='self_review' WHERE id=…` — governed by RLS policy `Users can update their own KPIs` whose `USING` requires **`status = 'kra_set'`**.
2. `UPSERT review_submissions …` — INSERT policy `Employees can create their own submissions` and UPDATE policy `Employees can update self review fields` both require **`k.status = 'self_review'`** on the linked KPI.

Failure modes that all surface as the exact toast the user sent:

- **Flip silently no-ops** when the KPI's current status is anything other than `kra_set` (e.g. already `self_review`, or `manager_check` / `audit` reached from a stale UI cache). PostgREST returns success with 0 rows, no exception is thrown, and the follow-up upsert then trips the RLS check.
- **Flip silently no-ops** when the KPI belongs to a different `employee_id` (proxy / delegated submission scenarios such as data-owner org KPIs). Same downstream RLS error.
- **Retry races**: `runWithRetry` treats certain transient network errors as retryable — a partial success on attempt N followed by attempt N+1 can flip semantics between INSERT and UPDATE paths.
- **Refetch between calls**: React Query invalidation or a realtime tick between step 1 and step 2 refetches the KPI. Nothing in the code checks the flip actually landed.

Confirmed for employee **Satyam Agarwal (100017 → uuid `6a3390cb-…`)**: 29 KPIs in `kra_set`, one KPI `24c6f0ae` has audit history showing `MANAGER_SENT_BACK_TO_EMPLOYEE` → back to `kra_set` with a leftover `review_submissions` row. This is exactly the class the current two-step client flow can't handle reliably.

## Risk & Impact Report

- **Data impact:** None to existing rows. New RPC only; RLS policies unchanged (server-side function bypasses via `SECURITY DEFINER`).
- **Workflow impact:** All self-review submissions go through one atomic server-side operation. Same visible behaviour on success.
- **UI/UX impact:** Same UI, but the "Submission Failed" toast becomes rare and, when it does fire, the message is precise (not "row violates RLS").
- **Regression risk:** Low-medium. Contained to `submitSelfReview` and the RPC. All other reviewer/auditor/data-owner flows untouched.
- **Scalability:** One RPC replaces two round-trips + up to 3 retries; net latency drops.
- **Security:** RPC verifies `auth.uid()` is the KPI's employee (or an authorised proxy per existing helpers). Non-employees are rejected explicitly.

## Plan

**A. New RPC (single source of truth for self-review submit)**

`public.submit_self_review(p_kpi_id uuid, p_achieved_value numeric, p_self_rating text, p_self_score numeric, p_self_remarks text, p_self_evidence_url text, p_self_evidence_urls text[], p_is_na boolean)`:
- `SECURITY DEFINER`, `search_path = public`.
- Verifies `auth.uid()` matches `kpis.employee_id`. If not, rejects with a clear error (`insufficient privileges: not the KPI owner`).
- Validates current KPI status is in `('kra_set','self_review')` — anything else raises a precise error (`KPI is at stage X; self-review is not allowed`).
- Atomically:
  1. Updates `kpis.status = 'self_review'` (idempotent — if already there, no-op).
  2. Upserts into `review_submissions` on `kpi_id`, writing only the self_* columns + `is_na`, `na_marked_by_role`, `kpi_status = 'submitted'`. Explicitly avoids touching reviewer columns.
  3. Inserts a `kpi_audit_logs` row with `action='SELF_REVIEW_SUBMITTED'`, `performed_by = auth.uid()`.
- Returns the new `review_submissions` row.
- `GRANT EXECUTE … TO authenticated`.

**B. Client refactor (`src/hooks/useKpis.ts` — `submitSelfReview`)**

- Replace the flip + `runWithRetry(upsert)` + compensator with a single `supabase.rpc('submit_self_review', {...})` call.
- Keep the existing `runWithRetry` wrapper around the RPC for genuine transient failures.
- Drop the now-redundant post-success `SELF_REVIEW_SUBMITTED` audit log insert (RPC does it).
- Preserve current `onMutate` / cache-invalidation semantics.

**C. Backward compatibility & data heal**

- Idempotency: RPC succeeds even if `review_submissions` row already exists (`ON CONFLICT (kpi_id) DO UPDATE`).
- Send-back cases: reviewer columns are NOT cleared by the RPC (§88 immutability). Only self_* columns are re-written.

**D. Tests & docs**

- `src/test/submitSelfReviewRpc.test.ts` — mocks Supabase client; asserts single RPC invocation, no direct `kpis.update` or `review_submissions.upsert` calls remain in the code path.
- pgTAP-style migration test verifying: (a) non-owner call rejected, (b) wrong-stage rejected, (c) `kra_set` case succeeds, (d) idempotent re-submit succeeds.
- Update `POLICY.md` §SELF-REVIEW-SUBMIT-ORDER: RPC becomes SSOT; client no longer sequences status + upsert.
- `DOCUMENTATION.md`: version bump + entry.

**E. Rollback**

- Feature-flag not needed — the RPC change is additive. If a critical bug appears, revert the client change; the old flip+upsert path still works for the majority of KPIs.

## Steps → Verification

1. Ship RPC migration → `psql` test as Satyam simulates `SET request.jwt.claim.sub …` → RPC succeeds for `kra_set` KPI, atomically updates both tables.
2. Ship client refactor → run vitest unit tests → confirm no more `.from('kpis').update({status:'self_review'})` and no `.from('review_submissions').upsert(…)` inside `submitSelfReview`.
3. Manually reproduce Satyam's flow in dev → submission succeeds, `kpi_audit_logs` entry present.
4. Sample 3 additional pending kra_set employees from the same cycle → all submit clean.
