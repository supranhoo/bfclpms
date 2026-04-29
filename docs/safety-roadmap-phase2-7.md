# Safety Module — Roadmap for Phases 2 → 7

> Source-of-truth roadmap for the remaining Safety Module build.
> Phases 0 (Hub & Shell) and 1 (Incident Management end-to-end, including
> the bonus client + server WebP image-compression pipeline) are already
> shipped. This document covers everything that remains and is updated
> as each sub-phase progresses.

---

## Status Tracker

| Phase | Sub-phase                            | Status      |
|-------|--------------------------------------|-------------|
| 0     | Hub & Shell                          | ✅ done      |
| 1     | Incident Management (1.A – 1.L)      | ✅ done      |
| A1    | Image Compression (client + server)  | ✅ done (bonus) |
| 2     | Permit to Work                       | ✅ done (2-A schema/RPCs, 2-B UI, 2-C tests — 16/16) |
| 3     | Training & SOP                       | ✅ done (3-A schema/RPCs + cron, 3-B UI worker+admin, 3-C tests 14/14) |
| 4     | Asset & Calibration                  | ✅ done (4-A schema/RPCs + cron, 4-B UI register/detail/new, 4-C tests 23/23) |
| 5     | Audit & Compliance Checklists        | ✅ done (5-A schema/RPCs, 5-B UI templates+runner+scoreboard, 5-C tests 11/11) |
| 6     | Emergency Response                   | ✅ done (6-A schema/RPCs, 6-B UI hub+drill+contacts, 6-C tests 16/16) |
| 7     | Analytics                            | ✅ done (7-A MVs+TRIR+cron, 7-B edge fn, 7-C dashboard+hours UI, 7-D tests 16/16) |
| X     | Cross-cutting Settings hub           | ⏳ todo      |

Update this table as each sub-phase moves through `todo → in_progress → done`.

---

## Universal rules (apply to every phase)

1. Routes live under `/safety/*` and import only from `@/components/safety/*`
   or `@/components/ui/*` (Safety Module Shell Isolation).
2. Cache keys use the `['safety', ...]` prefix; invalidation goes through
   `invalidateAllSafetyQueries` (POLICY §110).
3. Every new table gets RLS from day one, with a `has_safety_role()`
   SECURITY DEFINER check — never recurse into the same table.
4. Every status / lifecycle change goes through an RPC with envelope
   `{ ok, error?, result? }`; direct UPDATE on lifecycle columns is blocked
   by a BEFORE UPDATE trigger.
5. Every destructive UI action uses `ConfirmDestructiveDialog`.
6. Every realtime-read table gets `REPLICA IDENTITY FULL` and is added to
   `supabase_realtime`.
7. Evidence uploads route through the existing image-compression pipeline
   (`safety-media` bucket + `compress-evidence` edge fn).
8. Every phase ships with Vitest coverage in `src/test/safety/`.
9. Every mutation writes to `safety_audit_log`. Automated actions set
   `performed_by = NULL`.
10. No hardcoded business variables — categories, durations, and thresholds
    live in `safety_master_data` or `safety_settings`.

---

## Phase 2 — Permit to Work (PTW)

LOTO + HIRA + 4-step approval. Soft dependency on Phase 4 (asset expiry blocks PTW).

### Schema
- Enums:
  - `safety_permit_type`: hot_work, confined_space, work_at_height,
    electrical, excavation, lifting, general.
  - `safety_permit_status` (final, configurable ladders): draft, submitted,
    in_approval, approved, active, suspended, closed, rejected, expired.
    Multi-level approvals are tracked via `current_level`/`total_levels`
    on `safety_permits` instead of one status per level.
- Tables:
  - `safety_permits` — permit_number (`PTW-YYYY-NNNN`), type, status,
    requested_by, business_unit_id, location, scope, start_at, end_at,
    hira_summary, loto_required, linked_asset_ids uuid[].
  - `safety_permit_approvals` — permit_id, level (1..4), approver_role,
    approver_id, decision, decided_at, notes.
  - `safety_permit_loto_steps` — step_no, description, isolated_by/at,
    verified_by/at, removed_by/at.
  - `safety_permit_hira` — hazard, risk_before, controls, risk_after.
  - `safety_permit_evidence` — same shape as `safety_incident_evidence`.

### RPCs / edge fns (✅ shipped in 2-A)
- `submit_permit`, `decide_permit_level`, `activate_permit`,
  `suspend_permit`, `close_permit`, `expire_overdue_permits`.
- BEFORE UPDATE trigger blocks direct status writes (RPC sets
  `safety.permit_fsm` session flag).
- Edge fn `permit-expiry-sweep` + pg_cron every 15 min (job
  `permit-expiry-sweep-15min`).
- Asset-expiry check inside `activate_permit` is a soft no-op until
  Phase 4 ships `safety_assets`.

### UI (✅ shipped in 2-B)
- `/safety/permits` — list + status/type/text filters, live vs history split
- `/safety/permits/new` — wizard (Save Draft / Submit for Approval) with
  inline HIRA + LOTO editors; no default duration.
- `/safety/permits/:id` — detail with approval ladder, action dialogs for
  approve/reject/suspend/close, role-gated buttons via `useMySafetyRoles`.
- `/safety/settings/permit-types` — admin per-type ladder editor with
  add/remove level + role picker + active toggle.

### RLS
- SELECT: admin OR safety_head OR requester OR approver OR same-BU manager.
- INSERT: any worker. Status mutations only via RPC.

### UI
- `/safety/permits` list (filters: status, BU, type, mine).
- `/safety/permits/new` (HIRA + LOTO toggle + asset linker).
- `/safety/permits/:id`: `PermitApprovalLadder`, `LotoChecklist`,
  `HiraTable`, `PermitEvidencePanel`, `PermitTimeline`.
- Sidebar entry "Permits" with "awaiting my approval" badge.

### Notifications
`permit_submitted`, `permit_decision`, `permit_activated`,
`permit_expiring_soon` (T-2h), `permit_expired`, `permit_suspended`.

### Tests
`permit-fsm.test.ts`, `permit-expiry.test.ts`, `permit-asset-block.test.ts`,
`permit-rls.test.ts`.

### DoD
Worker submits hot-work PTW → 4 approvers act in order → permit activates
→ LOTO verified → time elapses → permit auto-expires → notifications
dispatched → audit complete.

---

## Phase 3 — Training & SOP

Role-based assignment, scroll-lock reading, randomised quiz ≥80%, overdue escalation.

### Schema
- `safety_sops` — code, title, version, body_md, attachments, min_read_seconds, is_active.
- `safety_quizzes` — sop_id, pass_threshold (default 80).
- `safety_quiz_questions` — quiz_id, prompt, options jsonb, correct_index, weight.
- `safety_training_assignments` — user_id, sop_id, assigned_by, due_at,
  status (pending|in_progress|passed|failed|overdue), attempts_count.
- `safety_training_attempts` — assignment_id, started_at, finished_at,
  score, passed, answers jsonb.

### RPCs
- `assign_sop_to_role(sop_id, safety_app_role, bu_id?, due_in_days)` —
  bulk insert filtered by `safety_user_roles`.
- `start_attempt`, `submit_attempt(answers)` — server-side scoring.
- Cron `training-overdue-sweep` daily — escalate after N days.

### UI
- `/safety/training` (My assignments, scroll-lock reader, randomised quiz, retry policy).
- `/safety/training/admin` (SOP CRUD, quiz builder, role assignment, completion dashboard).

### Tests
- Reader cannot submit before `min_read_seconds`.
- Quiz randomisation deterministic per attempt.
- Pass/fail thresholding correct.
- Overdue cron escalation.

### DoD
Admin uploads SOP v1, assigns to all `worker` in BU=Plant-1 with 7-day due
→ users complete reader + quiz → results recorded → overdue users
escalated → dashboard shows compliance %.

---

## Phase 4 — Asset & Calibration

Asset register, T-7/T-1/overdue alerts, expiry blocks PTW.

### Schema
- `safety_assets` — asset_code unique, name, category, business_unit_id,
  department_id, location, manufacturer, model, serial_no, install_date,
  calibration_required, calibration_interval_days, calibration_expires_at,
  last_calibration_at, status (active|under_maintenance|retired).
- `safety_asset_calibrations` — performed_by, performed_at,
  certificate_url, next_due_at, notes.
- `safety_asset_evidence` — photos / manuals.

### RPCs
- `record_calibration(asset_id, performed_at, certificate_url, next_due_at)`
  — updates asset row in same tx.
- Cron `asset-calibration-sweep` daily → T-7, T-1, overdue notifications.

### UI
- `/safety/assets` register with filters (BU, category, expiry window).
- `/safety/assets/:id` with calibration history + evidence.
- Bulk CSV import.

### PTW link
Phase 2's `activate_permit` queries `safety_assets`; finalised here.

### Tests
Sweep correctness, PTW block on expiry, RLS cross-BU.

### DoD
Asset register populated, calibration recorded, alerts fire, expired
asset blocks PTW activation, audit complete.

---

## Phase 5 — Audit & Compliance Checklists

Checklists, scoring, auto-incident on non-compliance, BU compliance scoreboard.

### Schema
- `safety_audit_templates` — title, version, category, is_active.
- `safety_audit_template_items` — section, prompt, weight, critical, evidence_required.
- `safety_audit_runs` — template_id, business_unit_id, location,
  conducted_by, conducted_at, score, status (draft|submitted|reviewed).
- `safety_audit_run_responses` — item_id, answer (yes|no|na), score,
  notes, evidence_path, auto_incident_id NULL.

### Logic
- On `submit_run`: any `critical=true && answer=no` →
  `create_safety_incident_from_audit(...)`, linked via `auto_incident_id`.
- Score = Σ(weight × points) / Σ(weight) over non-NA items.

### UI
- `/safety/audits/templates` (admin CRUD).
- `/safety/audits/runs/new` (mobile-friendly checklist).
- `/safety/audits/runs/:id` review.
- `/safety/audits/scoreboard` (BU heatmap, trend).

### Tests
Auto-incident creation, scoring formula, evidence_required enforcement.

### DoD
Auditor runs checklist on tablet → submits → score computed → critical
NOs auto-create incidents → BU scoreboard updates.

---

## Phase 6 — Emergency Response

30-sec confirm countdown, broadcast, drill vs real, defaulter list,
mandatory post-event report → auto incident.

### Schema
- `safety_emergencies` — type (fire|gas|medical|evacuation|other),
  mode (drill|real), business_unit_id, location, triggered_by,
  triggered_at, ended_at, status (armed|active|stand_down|closed).
- `safety_emergency_acks` — emergency_id, user_id, ack_at,
  channel (app|sms|web).
- `safety_emergency_post_reports` — summary, lessons_learned,
  attachments, linked_incident_id.

### Flow
- Trigger button → 30s countdown with cancel → on confirm, broadcast to
  all users in BU via `safety_notifications` + (future) SMS hook.
- Defaulter list = users in BU who did not ACK within X minutes.
- After `stand_down`, post-event report mandatory; submission auto-creates
  an incident (`accident` or `near_miss`) linked back.

### UI
- `/safety/emergency` (big red Trigger with countdown, mode toggle).
- `/safety/emergency/:id` live ack board, defaulter list.
- `/safety/emergency/:id/report`.

### Tests
Countdown cancel, ack timing, defaulter calculation, mandatory
post-report → incident link.

### DoD
Drill triggered → broadcast received → ≥90% ack within 5 min →
defaulters listed → stand-down → post-report submitted → incident
auto-created.

---

## Phase 7 — Analytics

TRIR, severity rate, open vs closed, training %, BU heatmaps, time-trends.

### Approach
- Materialised views refreshed every 30 min by `safety-analytics-refresh` cron:
  - `mv_safety_trir` (rolling 12-month, per BU): TRIR =
    (recordable cases × 200,000) / hours_worked. Hours from new
    `safety_hours_worked` table (admin-entered monthly per BU).
  - `mv_safety_severity_rate`, `mv_incidents_open_vs_closed`,
    `mv_training_compliance`, `mv_audit_scoreboard`, `mv_permit_throughput`.
- Edge fn `safety-analytics` returns cached MV reads with optional
  date / BU filters.

### UI
- `/safety/analytics` dashboard with cards (TRIR, LTI count, open
  incidents, training %, audit avg, PTW backlog) + charts (trend line,
  BU heatmap, severity stacked bar).
- Export to CSV / PDF (re-use PMS export pattern).

### Tests
TRIR formula, MV refresh idempotency, role-scoped reads.

### DoD
Dashboard renders < 1.5s, numbers reconcile with raw tables, BU filter
works, exports succeed, only authorised roles see global view.

---

## Cross-cutting tasks (do near the start)

- **Settings hub** `/safety/settings` index page collecting: Users (done),
  Master Data, Notifications, SLA matrix, PTW expiry warning offset,
  Training overdue policy, Analytics hours-worked entry. All values in
  a new `safety_settings` (key, value jsonb) table — zero hardcoding.
- **Module Hub gating** — extend `useModules` so disabling Safety in
  `/admin/module-hub` removes it from the Hub within one realtime tick
  (already partly implemented; add a regression test).

---

## Execution protocol

1. Pick **one** sub-phase from the tracker.
2. Produce a Risk & Impact Report (per workspace policy).
3. On approval, implement schema → RPC → edge fn → UI → tests →
   docs/memory in that order, in a single coherent build.
4. Mark the row `done` in the tracker, then move to the next.

---

## Version History

- 2026-04-29 — Initial roadmap created. Phases 0, 1, A1 marked done.
  Phase 2 recommended as the next build (self-contained, unlocks Phase 4
  asset link).
- 2026-04-29 — Phase 2 (PTW) completed end-to-end (schema/RPCs/UI/tests).
- 2026-04-29 — Phase 3 (Training & SOP) completed: 5 tables, 4 RPCs,
  scroll-locked reader, server-scored randomized quiz, daily overdue
  sweep cron, worker + admin UIs, 14/14 SSOT tests passing.
- 2026-04-29 — Phase 7 (Analytics) completed: `safety_hours_worked` table,
  6 materialized views (TRIR, severity, open/closed, training, audit,
  permits), `refresh_safety_analytics()` RPC with 30-min pg_cron,
  `safety-analytics` edge fn, dashboard + hours-worked admin pages,
  CSV export, 16/16 SSOT tests passing.