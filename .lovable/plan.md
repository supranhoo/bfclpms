## 1. Assumptions

- The failing action is an employee posting a reply on observation thread `OBS-02470` (KPI "Network Infrastructure Uptime", employee Bhaskar Jyoti Sharma).
- The intended behaviour is: anyone already participating in an observation thread (author, KPI owner, previous repliers, previously mentioned users) may be notified about that thread.

## 2. Verified current state

- The toast text comes from trigger function `tg_notifications_enforce_sender_relationship()`, which raises `42501 not authorized to send notifications to user %` when `can_send_notification_to(auth.uid(), NEW.user_id)` returns false.
- Target `0b3aaf91-…` is **Ayush Bansal (Auditor003, role `auditor`, active)** — the **author** of `OBS-02470`.
- `can_send_notification_to` allows an auditor to send to anyone, but the **reverse direction** (employee → auditor) is only allowed when an audit assignment links them.
- Query confirms **zero** rows in `audit_kpi_assignments` and `audit_kpi_level_assignments` linking Ayush to that employee, and zero KPI-level assignments for that KPI. So the reverse edge legitimately does not exist.
- There is **no edge in the guard for observation/query thread participation** — that relationship type is simply not modelled.
- `useCreateObservationReply` inserts the reply first, then inserts notifications, then upserts `kpi_mention_access`. The notification exception aborts the mutation *after* the reply row is already committed, so the user sees a hard red error even though the reply saved, and the mention access grant never happens.

Root cause (5-Why):
1. Employee cannot reply cleanly → 2. notification insert rejected → 3. guard returns false for employee→auditor → 4. the only auditor edges modelled are assignment-based, and this auditor observed a KPI he is not assigned to → 5. the notification guard was written from an **org-hierarchy/assignment** model, with no concept of **conversation membership**, and no test/contract exists that every in-app notification producer has a matching allowed edge.

## 3. Risk & impact report

- **Data impact**: new SQL helper + guard branch; one new RPC. No schema change to existing tables, no data rewrite. Additive only.
- **Workflow impact**: employees regain the ability to reply and notify thread participants. No new visibility is granted beyond people already in the thread (mention access grant already exists today).
- **Security impact**: the widening is narrowly scoped to *existing participants of the same observation thread* — not "employee may notify any auditor".
- **UI/UX impact**: reply posting becomes atomic; failure of the notification step no longer shows a false "Error" after a successful reply.
- **Regression risk**: `can_send_notification_to` is used by the trigger and by notification RLS; changes are additive `RETURN true` branches, so no existing allowed path can start failing. Medium risk of query cost — mitigated with indexed lookups and `LIMIT 1`.
- **Scalability**: participant lookup is 3 indexed `EXISTS` probes keyed by `observation_id`/`kpi_id`.
- **Rollback**: previous function body is preserved in the migration file header; revert = re-apply prior definition. No destructive step.

## 4. Plan

**Step 1 — Model conversation membership (SSOT helper)**
`public.is_observation_participant(_user uuid, _observation_id uuid) returns boolean` (STABLE, SECURITY DEFINER, `search_path=public`): true when the user is the observation `created_by`, the KPI owner (`kpis.employee_id`), an author of any reply on that thread, or holds `kpi_mention_access` for the KPI.
*Verification*: direct SQL check returns true for Ayush + `OBS-02470`, false for an unrelated user.

**Step 2 — Add the participant branch to `can_send_notification_to`**
Extend the guard with a branch: if the notification carries an `observation_id` context and **both** sender and target are participants of that thread → allow. Since the guard signature only takes two uuids, add an overload `can_send_notification_to(sender uuid, target uuid, context jsonb)` used by the trigger when `NEW.metadata->>'observation_id'` (or `type in ('observation_mention','query_*')`) is present; the 2-arg version stays unchanged for all other callers.
*Verification*: `select public.can_send_notification_to(<employee>, <auditor>, '{"observation_id":"5205006a-…"}')` → true; same call with a random third user → false.

**Step 3 — Update the trigger to pass thread context**
`tg_notifications_enforce_sender_relationship()` reads `NEW.metadata->>'observation_id'` and calls the 3-arg overload; behaviour otherwise identical (including the null-`auth.uid()` service-role bypass).
*Verification*: insert a notification as the employee for the auditor with/without the metadata key.

**Step 4 — Make reply posting atomic (removes the partial-write class of bug)**
New RPC `post_observation_reply(p_observation_id, p_reply_text, p_evidence_urls, p_mentioned_user_ids)` that inserts the reply, auto-acknowledges the observation, inserts mention notifications, and upserts `kpi_mention_access` in one transaction. `useObservationReplies.ts` calls the RPC instead of four sequential client writes.
*Verification*: forced failure in the notification step leaves no orphan reply row.

**Step 5 — Notifications must never block the primary action**
Inside the RPC, wrap the notification insert in a `BEGIN … EXCEPTION WHEN insufficient_privilege` block that records a row in an existing audit/log table and continues. The user gets the reply saved plus a non-destructive warning toast ("Reply posted; some participants could not be notified"), never a red blocking error.

**Step 6 — Prevent recurrence (the actual ask)**
- `src/lib/notifications/edgeRegistry.ts`: a declared registry mapping every client-side notification `type` → the relationship edge that authorises it (hierarchy / audit assignment / annual-review stage / observation participation / global role).
- A test `notificationEdgeCoverage.test.ts` that scans the codebase for `from('notifications').insert` and RPC notification emitters and fails the build when a `type` has no registered edge.
- A test asserting the latest migration defining `can_send_notification_to` still contains every registered edge branch (extends the existing `canSendNotificationToSchema.test.ts` pattern).
- Add a **security-change checklist** to `DOCUMENTATION.md`: any tightening of a guard function must (a) enumerate the callers, (b) add/refresh the edge registry, (c) ship a regression test per edge.

**Step 7 — Repair the affected thread**
Post the pending notification/mention-access rows for `OBS-02470` participants (admin-side, idempotent) so the auditor is notified of the reply that already saved.

## 5. UI changes

- `KpiObservationsSection.tsx` reply flow: single RPC call; success toast unchanged; new amber "partially notified" toast variant when the server reports skipped recipients. No layout, spacing, or navigation change; no responsiveness impact.

## 6. Tests

- `isObservationParticipant` unit/SQL tests: author, KPI owner, replier, mentioned user, outsider.
- Guard tests: employee→auditor allowed **only** with a valid thread context; blocked otherwise.
- RPC atomicity test: notification failure does not orphan the reply.
- Edge-registry coverage test (Step 6).
- Mock data: an observation authored by an auditor with **no** audit assignment (the exact production shape here).

## 7. Documentation & policy

- **ADR-189 — Observation thread participation as a notification edge** (root cause, 5-Why, CAPA, rollback).
- **POLICY §108g — AR/KPI notification edges are registry-governed**: every notification producer must declare its authorising edge; guards may only be tightened alongside a registry + test update.
- **POLICY §OBS-REPLY-ATOMICITY**: reply, acknowledgement, notifications and mention access are one server-side transaction; notification failures degrade gracefully and never block the reply.
- `DOCUMENTATION.md` version history entry.

## 8. Post-implementation notes

Corrective (this bug) and preventive (registry + coverage tests + checklist) actions are separated deliberately: the corrective fix alone would leave the next guard tightening free to break another silent producer.
