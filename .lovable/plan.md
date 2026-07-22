
## Assumptions

- The complaint is that Umesh Kumar Mehta (100316, `manager` + dept-head of 7 departments) and his manager Jitendra still see the "not authorized to send notifications to user 3d06ca4d… (Mayank / Auditor002)" toast when approving a KPI, i.e. moving `self_review → manager_check`.
- The recipient in the toast (`3d06ca4d…`) is the auditor **Mayank (Auditor002)**, not the reviewer. So the toast is auditor-directed, but the *actor* is a reviewer — that is the angle you asked me to re-check.

## What I verified in the live DB

1. `notify_on_kpi_status_change()` no longer does a role-wide auditor broadcast — it dispatches only to the UNION of `audit_kpi_level_assignments` (by KPI) and `audit_kpi_assignments` (by employee). ADR-132 code is live.
2. `can_send_notification_to()` contains the ADR-131 reviewer↔auditor edge (auditor of an employee ↔ that employee's reporting/functional manager, skip, dept head, BU head).
3. Mayank has **516** KPI-level and **1** employee-level assignments overall, but **only 1** of those touches an employee inside Umesh's dept-head scope (91 employees) and **0** inside his direct reporting team (11 employees).
4. That means the failing toast fires precisely on the specific KPIs where Mayank *is* an assigned auditor AND the caller is *not* recognised as a reviewer of that KPI's employee by `can_send_notification_to`.

## Root-cause hypothesis (unconfirmed until we capture one live failure)

The guard currently treats "reviewer of the audited employee" as: reporting manager, functional manager, skip (mgr-of-mgr), dept head, BU head. It does **not** include several reviewer roles that Umesh legitimately holds when approving:

- **Sub-unit / sub-branch head** (`business_unit_sub_units`) — Umesh heads a sub-unit for at least one dept employee.
- **Workflow-resolved manager** via `workflow_config` / effective chain (someone acting as the KPI's next-stage reviewer even though they aren't the profile's reporting manager).
- **HR PMS / bulk-approval proxy** invoking `advance_kpi_status` on behalf of the manager.

If Umesh approved via any of those paths, the auditor dispatch is correct (Mayank is assigned) but the guard rejects him as sender, rolling back the whole KPI status update.

I want to confirm the actual failing KPI + caller before widening the guard, so the plan starts with a targeted read.

## Risk & Impact

- **Data**: guard changes only widen who may INSERT into `notifications`; no historical data touched.
- **Workflow**: unblocks legitimate reviewer→auditor notifications; no change to who sees what.
- **Security**: only adds authenticated, structurally-verified relationships (sub-unit head, workflow-resolved reviewer). No blanket allowances.
- **Regression**: covered by extending existing tests in `kpiAuditorNotificationDispatch.test.ts` and a new `canSendNotificationTo.reviewerAuditor.test.ts`.
- **Rollback**: single migration replacing the function; previous body preserved in ADR-132/133.

## Plan

1. **Capture the real failure** (read-only)
   - Query recent `kpis` rows for Umesh's dept employees where `updated_at` is in the last 24h and status is stuck at `self_review`, cross-join with Mayank's assignments to pinpoint the exact KPI(s) that couldn't advance.
   - For each such (caller=Umesh, target=Mayank, emp=X) triple, evaluate `can_send_notification_to` and print which branch fails.

2. **Extend `can_send_notification_to` (ADR-133)** to recognise the missing reviewer relationships found in step 1. Expected additions:
   - Sub-unit / sub-branch head of the audited employee's sub-unit.
   - Any user resolved as the employee's next-stage reviewer via `workflow_config` / effective workflow (SECURITY DEFINER helper `is_effective_reviewer_of(sender, emp)`).
   - HR PMS acting on behalf of a manager (already covered globally, verify).
   Keep the change strictly additive.

3. **Trigger safety net**
   - Wrap the auditor-fanout INSERT in `notify_on_kpi_status_change()` in a per-row `BEGIN … EXCEPTION WHEN insufficient_privilege THEN NULL; END;` so a single unauthorised recipient never rolls back the status change. This mirrors the pattern already used for `foreign_key_violation`.

4. **Documentation & policy**
   - New ADR-133 "Reviewer↔Auditor guard completeness".
   - POLICY §108g clarifies that notification failures are non-blocking for KPI status transitions.
   - DOCUMENTATION.md version history entry.

5. **Tests**
   - Unit: `canSendNotificationTo.reviewerAuditor.test.ts` covering reporting mgr, functional mgr, skip, dept head, BU head, sub-unit head, workflow-resolved reviewer.
   - Integration: `kpiStatusChange.dispatchIsolation.test.ts` proving one unauthorised recipient does not roll back the transition.

6. **Manual verification for Umesh**
   - Re-run the exact `self_review → manager_check` transition on the previously failing KPI as Umesh and confirm success in the app.

## Technical notes

- `notify_on_kpi_status_change` is `SECURITY DEFINER`, but INSERT policy on `notifications` uses `auth.uid()` (the caller), so widening the guard is the correct lever — not switching the trigger's role.
- Sub-unit head lookup uses `business_unit_sub_units.head_user_id` (verified present).
- Effective reviewer resolution reuses existing helper (`resolve_next_reviewer_for_kpi`) rather than re-encoding the workflow.

No hardcoding of names/IDs; all lookups go through master data.
