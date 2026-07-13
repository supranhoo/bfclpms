## Root cause

Love Sahrawat (101896) — and every employee submitting self-review — hits `new row violates row-level security policy for table "review_submissions"` because the client submits in the wrong order relative to the newly tightened RLS policy.

The recent policy hardening (see prior turn: "Review submission self-update: Column-scope employee UPDATE to self_* fields only, gated by kpi_status='self_review'") requires, for both INSERT and UPDATE on `review_submissions` by an employee:

```
EXISTS (
  SELECT 1 FROM kpis k
  WHERE k.id = review_submissions.kpi_id
    AND k.employee_id = auth.uid()
    AND k.status = 'self_review'
)
```

But `src/hooks/useKpis.ts` (`submitSelfReview`, ~line 1060-1089) does the reverse:

1. `upsert` into `review_submissions` — **blocked** because `kpis.status` is still `kra_set`.
2. Only afterwards, `update kpis.status = 'self_review'`.

Step 1 always fails; step 2 never runs. Result: toast "Submission Failed – new row violates row-level security policy".

Confirmed via DB: employee 101896 has 15 KPIs in `kra_set`, 0 in `self_review`. Same client bug affects every employee on the platform since the RLS tightening.

## Risk & impact

- Scope: single client-side reorder in `useKpis.ts` — 2 blocks swapped.
- Data: no schema, RLS, or workflow-logic change. Zero migration.
- Regression risk: minimal. The `kpis` UPDATE policy already permits an employee to move their own KPI from `kra_set → self_review` (that's how it worked before — status flip was step 2 and never rejected). If the status flip succeeds but the submission upsert then fails for a *non-RLS* reason, the KPI is left in `self_review` with no submission row — same visible state the app already handles today (self-review sheet reopens on `self_review` with empty fields). Add a compensating rollback catch so status is reverted to `kra_set` on submission failure to avoid orphaning.
- Rollback: trivial revert of the reorder + try/catch.

## Fix

In `src/hooks/useKpis.ts` `submitSelfReview` mutation:

1. Flip `kpis.status` to `self_review` FIRST (satisfies RLS pre-condition).
2. Then upsert the `review_submissions` row.
3. Wrap step 2 in a try/catch — on failure, revert `kpis.status` back to `kra_set` so the user can retry cleanly, and re-throw the original error to the toast.
4. Audit log stays after the successful upsert.

The `is_na` self-N/A path in the same file (if it does the same upsert-first pattern) gets the same reorder — I'll re-check it while editing.

## Tests

- `src/test/selfReviewSubmitOrder.test.ts` — new: mocks supabase client, asserts the status update is called BEFORE the submissions upsert, and that a failing upsert triggers the status-revert compensator.
- Re-run `src/test/bugBountyFixes.test.ts` and `src/test/self*.test.ts` to catch regressions in the self-review flow.

## Docs / policy sync

- `POLICY.md` §SELF-REVIEW-SUBMIT-ORDER (new): "Client-side self-review submission MUST flip `kpis.status` to `self_review` before writing to `review_submissions`. Any submission failure must compensate by reverting the status flip. This mirrors the RLS pre-condition; do not relax the RLS in place of ordering the client correctly."
- `DOCUMENTATION.md` version bump + entry.
- `mem://features/review/self-review-specifications` — append the ordering rule.

## Files touched

- `src/hooks/useKpis.ts` (reorder + compensator in `submitSelfReview`, ~30 line diff).
- `src/test/selfReviewSubmitOrder.test.ts` (new).
- `POLICY.md`, `DOCUMENTATION.md`, memory file above.

Ready to implement on approval.