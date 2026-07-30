# Plug PIP Management into Full Functionality (ADR-205)

## 1. Assumptions

- PIP has never been used in production: `performance_improvement_plans`, `pip_milestones`, `pip_audit_logs` all contain **0 rows**. No historical data to migrate or protect.
- Approvers = `hr_pms` + `admin` + `management`; the initiator may **not** approve their own PIP.
- Outcome wording (Successful / Partially Successful / Unsuccessful) is a **display-layer** mapping over the existing `pip_outcome` enum. No enum migration.
- `terminated` is displayed as **Cancelled**. No enum migration.
- Fiscal/period conventions and the existing `system_settings` PIP threshold stay as-is.

## 2. Clarifications

Resolved in this turn. No open questions.

## 3. Risk & Impact Report

**Data Impact**
- No table/column drops. Additive only: new RLS policies, a transition-guard trigger, a `pip_audit_logs` insert path, one new SECURITY DEFINER helper.
- Zero existing rows → no backfill, no data-integrity exposure.
- All three PIP tables are already covered by the automatic backup discovery RPC (`get_backup_table_order()`), and no entry exists in `backup_denylist`. No backup change needed; will re-confirm coverage after migration.

**Workflow Impact**
- Managers and HR can, for the first time, actually use the module (today every non-admin action fails).
- Initiators lose the ability to approve their own PIP — intentional, closes a segregation-of-duties hole.
- Status changes become guarded: illegal jumps (e.g. `draft` → `completed`) will be rejected server-side.

**UI/UX Impact** — detailed in §5.

**Regression Risk**
- *Low* on existing modules: PIP RLS/trigger changes are scoped to three tables nothing else reads.
- *Medium* on notifications: PIP inserts into `notifications` are gated by `can_send_notification_to`. An HR approver who is not in the employee's reporting chain would be blocked, reproducing the recurring "not authorized to send notifications" toast. Mitigated by routing all PIP notifications through a single SECURITY DEFINER RPC rather than direct client inserts (same pattern as ADR-189 `post_observation_reply`).
- *Low–Medium* on the scheduled-email cron: a new reminder producer runs inside the existing `send-scheduled-emails` function. Mitigated by a feature flag and a per-PIP-per-day idempotency key so a re-run can never double-send.

**Scalability Impact**
- PIP volume is inherently small (low performers only, expected tens–low hundreds/year). Even so, the admin table gets **server-side pagination** (page size 25) rather than the current fetch-all, and the milestone reminder query is date-bounded and indexed.
- New indexes: `pip_milestones(milestone_date, status)` and `performance_improvement_plans(status, employee_id)`.

**Rollback Strategy**
- Every step is additive and independently revertible: drop the new policies/trigger/RPC and restore the prior `pip_audit_logs` policy. Feature flag `pip_milestone_reminders_enabled` can disable the reminder producer instantly without a deploy.

## 4. Step-by-step Plan

### Phase A — Unblock the core workflow (server)

**A1. Fix `pip_audit_logs` writes (the hard blocker).**
Replace the admin-only INSERT policy with a participation-scoped one, so the acting manager/HR/management user can write their own audit row, while `performed_by` is forced to `auth.uid()` by a trigger (immutability guarantee).
*Verify:* a manager-context insert against a PIP they initiated succeeds; an insert with a spoofed `performed_by` is rewritten to the caller; an unrelated user's insert is rejected.

**A2. Grant `hr_pms` PIP access.**
Add SELECT on all PIPs/milestones/audit-logs and UPDATE (approval fields) for `hr_pms`. Uses `has_role()` — no recursive subqueries.
*Verify:* query the policy catalogue and confirm `hr_pms` now appears; confirm an hr_pms user can read a PIP for an employee outside their reporting chain.

**A3. Segregation of duties + transition guard.**
New trigger `trg_pip_status_transition`:
- rejects approval where `hr_reviewer_id = initiated_by`;
- enforces the legal transition graph `draft → pending_hr_approval → active → (extended) → completed | terminated`, with `pending_hr_approval → draft` allowed for rejection;
- requires `outcome` + `completion_remarks` on `completed`;
- requires `extended_end_date > end_date` on `extended`;
- writes an audit row for every status change so the trail cannot be bypassed by a direct table update.
Also adds the missing `WITH CHECK` to the UPDATE policy.
*Verify:* attempt each illegal transition and confirm rejection; confirm a legal path writes exactly one audit row per step.

**A4. Notification safety.**
New `pip_notify(pip_id, event_type)` SECURITY DEFINER RPC that authorises the caller against the PIP, then inserts the `notifications` row with `performed_by`/relationship set correctly — bypassing the `can_send_notification_to` chain restriction that would otherwise break HR-initiated events. Register `pip_milestone_reminder` in `src/lib/notifications/edgeRegistry.ts` alongside the two existing events.
*Verify:* an hr_pms approver outside the employee's chain triggers approval and no "not authorized" error appears.

### Phase B — Client alignment

**B1. `src/hooks/usePIP.ts`** — route audit-log writes and notifications through the new RPC; wrap each mutation in explicit error handling with a user-facing toast (no silent failures); add `useCancelPIP`; add server-side pagination params to `usePIPs`.

**B2. New `src/lib/pip/pipVocabulary.ts` (SSOT)** — single mapping of enum → policy label: `improved → Successful`, `escalated → Partially Successful`, `not_improved → Unsuccessful`, `terminated → Cancelled`, plus status labels and badge variants. Every PIP surface imports from here; no literal status/outcome strings anywhere else.

**B3. `src/lib/pip/pipTransitions.ts` (SSOT)** — the legal transition graph, mirrored exactly by the PL/pgSQL trigger from A3 (same dual-SSOT pattern as ADR-179 `kraStageDisplay`), with a test asserting the two definitions agree.

**B4. `PIPDetailSheet.tsx`** — add the missing **Cancel PIP** action behind `ConfirmDestructiveDialog`; drive all action-button visibility from `pipTransitions.ts` + the caller's role; replace the inline milestone list with the existing `MilestoneTracker.tsx` (removing the dead code).

### Phase C — Missing integrations

**C1. Milestone reminders.** Add a PIP block to the existing `send-scheduled-emails` edge function: for every `active`/`extended` PIP, find milestones due within the configurable lead window or overdue, and emit `pip_milestone_reminder` to the initiator (cc employee) via `pip_notify`. Gated by a new `admin_feature_flags` row and an idempotency key of `pip_id|milestone_id|YYYY-MM-DD`. SLA thresholds move from the hardcoded `{warning: 0, critical: 7}` in `useSystemIssues.ts` into `system_settings` (Zero-Hardcoding rule), read by both the cron and the issues dashboard.
**C2. Report → action.** Add a **Start PIP** row action to the Monthly Trend PIP-candidates report that opens `PIPCreateDialog` pre-filled with the employee and the failing months as the stated reason. Extract the duplicated candidate rule out of `MonthlyTrendView.tsx` into `src/lib/pip/pipCandidateRule.ts` and have the existing test import the real function instead of reimplementing it.
**C3. Employee visibility.** Add a read-only **My PIP** card on the employee dashboard and a PIP tab on the employee profile (milestones, dates, outcome, letter download). Employees already have RLS SELECT on their own PIP.
**C4. Discoverability.** Extend the sidebar entry to `admin`, `management`, `hr_pms` and `manager` (matching the route guard, which already allows more roles than the sidebar shows), keeping `menu_access_config` as the authority so admins can still restrict it per profile.

### Phase D — Verification

Unit tests + mock data covering: transition graph parity (TS vs PL/pgSQL), vocabulary mapping completeness, self-approval rejection, audit-row-per-action, reminder idempotency, candidate rule, and pagination. Plus an integration test walking the full lifecycle draft → HR approval → milestone update → completion as a **non-admin manager** — the exact path that fails today.

## 5. UI Changes

| Where | What changes | Interaction | Responsive |
|---|---|---|---|
| `/admin/pip` table | Server-side pagination footer (25/page); status chips relabelled via the vocabulary SSOT ("Cancelled" not "Terminated") | Page controls; filters/search unchanged and pagination-aware | Table already scrolls horizontally on mobile; footer stacks |
| PIP Detail sheet | New **Cancel PIP** button (destructive, confirm dialog); Approve/Reject hidden for the initiator; milestone list replaced by `MilestoneTracker` timeline | Buttons appear only for legal transitions for that role | Sheet is full-width on mobile; action bar becomes sticky |
| Monthly Trend report | New **Start PIP** action per candidate row | Opens the create dialog pre-filled | Action collapses into the row overflow menu on mobile |
| Employee dashboard / profile | Read-only **My PIP** card + profile tab | Expand for milestones; letter download | Single-column stack below `md` |
| Admin → System Settings | PIP milestone SLA (lead days / overdue days) + reminder feature toggle beside the existing threshold card | Standard settings form | Inherits settings grid |
| Sidebar | PIP Management now visible to management / hr_pms / manager | — | — |

## 6. Documentation & Policy Updates

- **DOCUMENTATION.md** — new ADR-205 section: the transition graph, the vocabulary mapping table, the `pip_notify` RPC contract, reminder cron behaviour, and version-history entry.
- **POLICY.md** — new `§PIP-LIFECYCLE-GOVERNANCE`: approver set and self-approval prohibition; canonical status/outcome vocabulary and its enum mapping (removing the current §13 wording drift); mandatory audit row per state change; configurable SLAs; and `§PIP-NOTIFY-SSOT` requiring all PIP notifications to route through the RPC.

## 7. What I will *not* do

- No enum migrations (per your answers) — the wording gap is closed at the display layer and documented in POLICY so the drift is recorded, not hidden.
- No changes to the KPI/annual-review workflow engines, the backup engine, or `can_send_notification_to` itself — the PIP case is handled by its own definer RPC rather than by widening the global notification matrix again.
