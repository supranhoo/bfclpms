# Notification "not authorized" toast on Annual Review save — RCA & CAPA

## 1. Symptom
Employee (Binod Kumar, id `1530a276-…ddc96`) saves his Annual Review draft and the UI shows a red toast:

> not authorized to send notifications to user 1530a276-8fad-4196-af49-28ce819ddc96

The save itself likely succeeded, but the AR stage-change trigger tried to insert an in-app notification and was blocked by the notifications BEFORE INSERT guard.

## 2. 5-Why Analysis

1. **Why did the toast appear?** The AR save transitioned `overall_status` (e.g. `pending_self` → `pending_manager`, or a system re-fire to the employee), which invoked `notify_annual_review_stage_change()`, which inserted into `public.notifications`.
2. **Why did the INSERT fail?** The `BEFORE INSERT` trigger `tg_notifications_enforce_sender_relationship` called `can_send_notification_to(auth.uid(), NEW.user_id)` and it returned `false`.
3. **Why did the guard return `false`?** The guard only recognises **downward** relationships — `p.reporting_manager_id = sender`, `mgr.reporting_manager_id = sender` (skip), `d.head_id = sender`, `bu.head_user_id = sender`, or reviewer roles on KPIs/AR instances where `sender` is the reviewer. It has **no branch for the reverse direction** where the sender is the employee/subordinate and the target is their manager / skip / dept-head / BU-head / HR reviewer.
4. **Why does that matter here?** The self-review submission is an inherently **upward** notification: employee → manager (or → employee themselves on completion). `auth.uid()` inside the `SECURITY DEFINER` trigger is still the JWT caller (the employee), so the guard rejects the legitimate system-generated notification.
5. **Why wasn't this caught earlier?** Migration `20260717063237` (notification sender guard) was added recently and only unit-tested the manager→subordinate paths. The upward direction and the "SECURITY DEFINER trigger acting on behalf of the system" case were not modelled. POLICY §108 (notification-recipient-guard) covers FK to `auth.users` but not this new authorization guard.

**Root cause:** `public.can_send_notification_to()` is unidirectional (downward-only). Any DB trigger that fires under a subordinate's JWT and notifies upward is blocked.

## 3. Impact & Risk

- **Blast radius:** Every AR stage transition initiated by a non-admin user (self-review submit, manager forward to skip/BU/HR, send-back to self) can raise a `42501` exception inside the trigger. Because the trigger is `AFTER UPDATE`, the exception rolls back the parent UPDATE — meaning the AR save itself may also be silently failing on transitions, not just the notification.
- **Similar sites at risk (same class of bug):** `useKpis.ts`, `useQueryWorkflow.ts`, `useKpiObservations.ts`, `useObservationReplies.ts`, `useKpiRollbackRequests.ts`, `useAdminDataEntry.ts`, `usePIP.ts` — anywhere a non-admin employee client-side inserts a notification aimed at a manager/HR/auditor.
- **Data loss risk:** AFTER UPDATE trigger raising = full transaction rollback. Fix category, not the instance.

## 4. CAPA

### Corrective (immediate)
Extend `public.can_send_notification_to(sender, target)` to also allow **upward and peer-reviewer** paths, mirroring the existing downward branches:

- `target` is admin or `hr_pms` (any employee may notify HR/Admin about their own review).
- `sender` reports (directly, functionally, or skip) to `target`, OR `target` is the dept-head/BU-head of `sender`'s department.
- On KPIs: `sender = k.assigned_to` and `target IN (k.manager_id, k.skip_manager_id, k.hr_id, k.auditor_id, k.management_id)`.
- On AR instances: `sender = i.employee_id` and `target IN (i.manager_id, i.skip_id, i.dept_head_id, i.bu_head_id, i.hr_id)`, **and** the reverse — any named reviewer on the same instance may notify any other named reviewer or the employee (peer handoff between manager↔skip↔BU↔HR).

Keep the existing downward branches unchanged. Function stays `STABLE SECURITY DEFINER` with `search_path=public`.

No changes to the trigger `tg_notifications_enforce_sender_relationship` or to any RLS policy. No schema changes. No frontend changes.

### Preventive
1. **Unit tests** (`src/test/notificationSenderGuard.test.ts`, new) covering the full matrix: self, admin→any, HR→any, manager↔subordinate, skip↔subordinate, dept-head↔member, BU-head↔member, KPI reviewer↔subject (both directions), AR reviewer↔employee (both directions), AR peer reviewers, unrelated users denied.
2. **POLICY.md** — extend §108 (Notification Recipient Guard) with a new sub-section "§108b Sender authorization matrix" listing every allowed edge (down, up, peer) as the canonical table. Any future addition must land in that table and the test file in the same PR.
3. **DOCUMENTATION.md** — add a short "Notification authorization" section under Security cross-referencing POLICY §108b.
4. **ADR-112** — record the RCA, the bidirectional decision, and the rejected alternatives (bypass flag, service-role re-invoke, per-trigger `SET LOCAL`).

### Rejected alternatives
- *"Skip the guard when caller is inside a SECURITY DEFINER function"* — Postgres exposes no reliable flag; would require a session GUC set/unset around every trigger, high drift risk.
- *"Move notification inserts out of triggers into edge functions using the service role"* — huge refactor for the whole notification surface, disproportionate to this fix.
- *"Wrap every trigger notification insert in `EXCEPTION WHEN insufficient_privilege`"* — hides the real signal and would mask genuine authorization bugs.

## 5. Verification (post-migration)

- psql: `select public.can_send_notification_to('<binod>','<his_manager>');` → `true`.
- psql: reproduce the AR stage transition as Binod and confirm no `42501`; row lands in `public.notifications`.
- Vitest: `notificationSenderGuard.test.ts` all green.
- Manual: reload Binod's AR page, click Save, no toast; bell shows the notification for the manager.

## 6. Deliverables (this fix)

- **Backend:** one migration replacing `public.can_send_notification_to`.
- **Tests:** `src/test/notificationSenderGuard.test.ts` (SQL-string assertions on the migration, matching the pattern used in `bugBountyFixes.test.ts` §BUG-037).
- **Docs:** `docs/adr/ADR-112.md`, `POLICY.md` §108b, `DOCUMENTATION.md` cross-ref.
- **Frontend:** none.
- **Out of scope:** notification RLS policies, trigger refactor, edge-function rewiring, unrelated notification sites.

Awaiting approval to implement.
