## Root cause

Management submit fails with `new row violates row-level security policy for table "annual_review_instances"`.

The UPDATE policy `instances_stage_update` on `annual_review_instances` has a `USING` clause but **no `WITH CHECK`**. Postgres then reuses `USING` as the implicit `WITH CHECK`. Management's submit transitions `overall_status` from `pending_management` → `completed`, so the post-update row no longer satisfies `(management_id = auth.uid()) AND (overall_status = 'pending_management')`, and RLS rejects it.

This is the exact class of bug captured in mem `RLS Workflow Transitions` — status-transition UPDATE policies must supply an explicit `WITH CHECK` that permits the destination status.

Note: earlier stages don't hit this because their write path goes through a `SECURITY DEFINER` RPC (`advance_annual_review_stage`, etc.) that bypasses RLS. The Management finalize path performs a direct `.update()` from the client, exposing the missing `WITH CHECK`.

## 5 Whys
1. Why does the toast fire? RLS rejects the UPDATE on `annual_review_instances`.
2. Why? The new row (`overall_status = 'completed'`) fails the policy check.
3. Why? Policy has no explicit `WITH CHECK`, so `USING` is reused and demands `pending_management` on the new row.
4. Why wasn't this caught for other roles? They go through SECURITY DEFINER RPCs that skip RLS.
5. Why does the Management path write directly? ADR-138 added the stage but reused the generic client update helper without adding a matching WITH CHECK for terminal transitions.

## Fix plan (surgical, DB-only)

### Migration: `fix_instances_stage_update_with_check`
Recreate `instances_stage_update` with an explicit `WITH CHECK` that allows the legal destination status for each role:

- admin / hr_pms → any row (unchanged)
- employee (`employee_id = auth.uid()`) — USING `pending_self`; WITH CHECK `overall_status IN ('pending_self','pending_manager','pending_skip','pending_dept','pending_bu','pending_hr','pending_management','completed')` scoped to their own row
- manager → USING `pending_manager`; WITH CHECK forward statuses + `pending_self` (send-back)
- skip_manager → USING `pending_skip`; WITH CHECK forward + send-back
- dept_head → USING `pending_dept`; WITH CHECK forward + send-back
- bu_head → USING `pending_bu`; WITH CHECK forward + send-back + `completed`
- hr → USING `pending_hr`; WITH CHECK forward + `completed` + send-back
- **management → USING `pending_management`; WITH CHECK `overall_status IN ('pending_management','completed')` + send-back statuses**

Only the destination `overall_status` is constrained; ownership columns (`management_id`, etc.) must remain equal to `auth.uid()` in the new row so a reviewer cannot reassign the instance to someone else during their transition.

### Verification
- Re-run the Management "Finalise & Complete review" action on Jaspal's instance in preview — expect success, `overall_status = 'completed'`.
- Confirm other roles' send-back / advance still work (queries against `annual_review_access_audit`).
- Add a Vitest RLS contract test under `src/tests/` mirroring `RLS Workflow Transitions` memory: attempt a Management transition to `completed` and assert success.

## Out of scope
- No UI or business-logic changes.
- No changes to SELECT / INSERT / DELETE policies.
- No refactor of the Management submit call site (the direct update is intentional; RLS is the missing guardrail, not the client code).

## Risk & rollback
- Additive policy replacement inside a single transaction; rollback = restore prior policy body.
- No data mutation.
