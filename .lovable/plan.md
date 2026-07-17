## Goal

Confirm — end-to-end — that Auditor Shekhar Sharad (and every user with the `auditor` role) can review any KPI from both the **Dashboard** and **Bulk Review** paths, exactly as they could yesterday. If any verification step fails, restore the pre-today behavior surgically.

## Current-state findings (verified this turn)

- `public.can_send_notification_to` (live in DB) now returns `true` whenever the sender has role `auditor` — matches the pre-today permissive `notifications` INSERT behavior for auditors (POLICY §108d, applied last turn).
- RLS on `kpis`, `review_submissions`, `sub_period_submissions`, `kpi_audit_logs`, `kpi_observations`, `kpi_queries` still grants auditors global SELECT/UPDATE — unchanged today.
- No trigger on `kpis` / `review_submissions` today references the broken `d.head_id`; the only bidirectional guard reference is the fixed `can_send_notification_to`.
- No migration today altered auditor-scoped RLS on the review tables. The only auditor-relevant behavioral change today was the notification guard, which is already widened.

**Preliminary conclusion:** the auditor path should already be restored. This plan is a verification pass with a narrow contingent fix if any check fails.

## Verification checklist (no code changes yet)

For each check, capture the outcome; only if a check fails do we cut a follow-up migration.

1. **Notification guard — matrix probe**
   - `SELECT can_send_notification_to('<Shekhar>', '<Rama>')` → expect `true`
   - Probe 3 more auditor→arbitrary-employee pairs (one from each BU) → expect `true`
   - Probe employee→auditor upward → expect `true`

2. **RLS reachability — dashboard path**
   - As service_role, simulate: `SELECT id FROM kpis WHERE employee_id = <sample> LIMIT 5` under auditor JWT (via a `SET LOCAL role authenticated` + `request.jwt.claims` block) → expect rows returned.
   - Same for `review_submissions` on the sampled KPIs.

3. **Update path — dashboard action**
   - Simulate an auditor `UPDATE kpis SET status = <next> WHERE id = <sample>` on a KPI not in `audit_kpi_assignments` for Shekhar → expect success; no `not authorized to send notifications` error from the `notify_kpi_status_change` trigger.

4. **Bulk review path**
   - Read `bulk_review_batches` RLS + the bulk review RPC(s) invoked from the UI (`services/*bulk*` + any `bulk-review-*` edge function) and confirm no auditor-scoping was tightened today.
   - Execute one bulk-review dry run against 2 KPIs outside Shekhar's formal assignment set.

5. **UI reachability**
   - Log in as auditor in Playwright, open Dashboard → KPI detail → try Approve / Send Back / Forward. Then open Bulk Review → select 2 rows → Approve. Screenshot each toast.

## Contingent fixes (only if a check fails)

| Failing check | Fix |
|---|---|
| 1 (guard) | Re-issue `can_send_notification_to` with the auditor branch and add a pinned regression test in `src/tests/canSendNotificationToSchema.test.ts`. |
| 2 (RLS SELECT) | Add the missing auditor SELECT policy on the affected table, matching the pre-today permissive rule. |
| 3 (UPDATE) | Wrap the offending trigger's `INSERT INTO notifications` in `BEGIN … EXCEPTION WHEN insufficient_privilege OR check_violation THEN NULL; END;` per `mem://architecture/database/notification-recipient-guard`. |
| 4 (bulk RPC) | Restore the auditor branch in the bulk-review RPC / edge function to its yesterday form. |
| 5 (UI) | Trace the specific error to a resolver/hook and restore its auditor branch. |

Any fix will be additive (widen auditor access) — no destructive schema changes, fully rollback-safe.

## Deliverables

- Verification report (per-check pass/fail with the query, expected vs. actual).
- If any check fails: one migration + one regression test + POLICY.md §108d update + DOCUMENTATION.md version bump.
- If all checks pass: a POLICY.md note under §108d confirming auditor dashboard + bulk-review parity as of v2.66.116, plus a new regression test `src/tests/auditorReviewAccessMatrix.test.ts` that pins the guard matrix and RLS SELECT/UPDATE for auditors on `kpis` / `review_submissions` so a future migration cannot silently narrow it.

## Non-goals

- No changes to non-auditor roles.
- No touch to safety / incentive / annual-review flows beyond what is required to restore auditor behavior.
- No refactoring outside the auditor path.
