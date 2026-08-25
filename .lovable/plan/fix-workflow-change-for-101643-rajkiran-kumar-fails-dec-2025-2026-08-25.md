# Fix: workflow change for 101643 (Rajkiran Kumar) fails — Dec 2025

## What happens today

Assigning a per-employee workflow for December 2025 fails and the screen only says
"Failed to assign workflow." The database rejected the write with:

```text
ERROR: COALESCE types text and rating_level cannot be matched
```

Four of these errors were logged at 04:21–04:22 UTC today, matching the attempts.
No override row exists for 101643 — nothing was saved.

## 5-Why

1. Why did the assignment fail? The insert into the workflow mapping table was aborted by an error.
2. Why? The rating-preservation trigger (`workflow_change_step_back`, ADR-193) raised a type error.
3. Why? It runs `COALESCE(prior_final_rating, final_rating)` — `prior_final_rating` is stored as
   plain text while `final_rating` is the `rating_level` enum, and Postgres refuses to mix them.
4. Why wasn't this caught before? The branch only executes when the employee actually has approved
   KPIs in the target period whose ratings must be snapshotted; most workflow changes never reach it.
   The column type drift (text vs enum) was never reconciled.
5. Why did the user get no useful message? The Workflow Config page catches the error and shows a
   fixed string, discarding the database message.

## Root cause

Type drift between `review_submissions.prior_final_rating` (text) and `final_rating`
(`rating_level` enum), used together inside `COALESCE` in the snapshot branches of
`workflow_change_step_back`. Any workflow mapping change for an employee with approved,
rated KPIs in that period is blocked. This is the only function referencing that column.

## Fix (CAPA)

Corrective
1. Migration: recreate `workflow_change_step_back` with the two snapshot expressions cast
   explicitly — `COALESCE(rs.prior_final_rating, rs.final_rating::text)` — in both branches
   (lines 143/144 and 177/178 equivalents). No behaviour change otherwise; no schema change,
   no RLS change, no scoring change. Rollback = restore the previous function body.
2. Frontend: in `src/pages/admin/WorkflowConfig.tsx`, surface the real database message in the
   error toast for assign and remove (keep the generic text as fallback), so a future backend
   rejection is diagnosable from the screen.

Preventive
3. Unit/SQL check asserting `prior_final_rating` and `final_rating` remain COALESCE-compatible,
   plus a regression test that a workflow reassignment succeeds for an employee holding an
   approved, rated KPI in the target period.
4. Record as ADR-311 / POLICY §WF-CHANGE-NO-RATING-LOSS amendment; update DOCUMENTATION.md.

## Verification

- Re-run the assignment for 101643, December 2025, and confirm the mapping row exists and the
  prior score/rating snapshot is written.
- Confirm no new `COALESCE types` errors in the database logs afterwards.

## Risk & impact

- Data: none — expression-level cast only; snapshot values stored unchanged (text).
- Workflow: unblocks per-employee, per-department and per-grade workflow changes.
- UI: only the error toast text changes.
- Regression: low; the function is invoked by a single trigger, covered by the new test.
