
# Safety Module — Detailed Roadmap for Phases 2 → 7

Phases 0 and 1 are already shipped (Hub, decoupled `/safety` shell, full Incident Management end-to-end including FSM, RBAC, SLA, evidence, audit, realtime, offline, notifications, and the bonus client + server WebP image-compression pipeline).

This plan covers everything that remains. We will execute it **one phase at a time**, with explicit gates between phases.

---

## Deliverable from THIS step (planning only)

Create a single source-of-truth roadmap file the team can tick off:

- **File:** `docs/safety-roadmap-phase2-7.md`
- Contents: the per-phase scope, schema, RPCs, edge functions, UI surfaces, RLS rules, tests, and Definition of Done described below.
- A short `mem://features/safety/roadmap-phase2-7.md` pointer so future sessions remember where the plan lives.
- Add a top-of-doc "Status Tracker" table so we mark each sub-phase as `todo / in_progress / done` as we go.

No code, schema, or edge functions are touched in this step — only the doc.

---

## Universal rules that apply to every phase below

1. All routes live under `/safety/*` and may import only from `@/components/safety/*` or `@/components/ui/*` (Safety Module Shell Isolation memory).
2. All cache keys use the `['safety', ...]` prefix; invalidation goes through `invalidateAllSafetyQueries` (POLICY §110).
3. Every new table gets RLS from day one, with a `has_safety_role()` SECURITY DEFINER check — never recurse into the same table.
4. Every status / lifecycle change goes through an RPC with the envelope `{ ok, error?, result? }`; direct UPDATE on lifecycle columns is blocked by a BEFORE UPDATE trigger.
5. Every destructive UI action uses `ConfirmDestructiveDialog`.
6. Every new table that is read realtime gets `REPLICA IDENTITY FULL` and is added to `supabase_realtime`.
7. All evidence uploads route through the existing image-compression pipeline (`safety-media` bucket + `compress-evidence` edge fn).
8. Every phase ships with Vitest coverage in `src/test/safety/` before being marked done.
9. Audit: every mutation writes to `safety_audit_log` (already exists) using the existing convention.
10. No hardcoded business variables — categories, durations, thresholds live in `safety_master_data` or `safety_settings` tables editable by Safety Admin.

---

## Phase 2 — Permit to Work (PTW)

LOTO + HIRA + 4-step approval workflow, with a soft dependency on Phase 4 (asset expiry blocks PTW).

**Schema**
- Enums: `safety_permit_type` (hot_work, confined_space, work_at_height, electrical, excavation, lifting, general), `safety_permit_status` (draft, submitted, approved_l1, approved_l2, approved_l3, active, suspended, closed, rejected, expired).
- Tables:
  - `safety_permits` — id, permit_number (PTW-YYYY-NNNN), type, status, requested_by, business_unit_id, location, scope, start_at, end_at, hira_summary, loto_required (bool), linked_asset_ids uuid[], created_at, updated_at.
  - `safety_permit_approvals` — permit_id, level (1..4), approver_role, approver_id, decision, decided_at, notes.
  - `safety_permit_loto_steps` — permit_id, step_no, description, isolated_by, isolated_at, verified_by, verified_at, removed_by, removed_at.
  - `safety_permit_hira` — permit_id, hazard, risk_before, controls, risk_after.
  - `safety_permit_evidence` — same shape as `safety_incident_evidence`.

**RPCs / Edge fns**
- `submit_permit(p_permit_id)`, `decide_permit_level(p_permit_id, p_level, p_decision, p_notes)`, `activate_permit`, `suspend_permit`, `close_permit`.
- BEFORE UPDATE trigger blocks direct status writes (mirrors incidents).
- Edge fn `permit-expiry-sweep` (pg_cron every 15 min) auto-expires PTWs past `end_at` and notifies requester + L1 approver.
- Soft dependency on Phase 4: `activate_permit` checks `linked_asset_ids` against `safety_assets.calibration_expires_at`; if any expired, returns `{ok:false, error:"asset_expired:<id>"}`.

**RLS**
- `has_safety_role(uid,'admin') OR has_safety_role(uid,'safety_head') OR requester OR approver_for_permit(uid,permit_id) OR same-BU manager` → SELECT.
- INSERT by any worker; status mutations only via RPC.

**UI**
- `/safety/permits` list (filters: status, BU, type, mine).
- `/safety/permits/new` (HIRA section + LOTO toggle + asset linker).
- `/safety/permits/:id` detail with `PermitApprovalLadder`, `LotoChecklist`, `HiraTable`, `PermitEvidencePanel`, `PermitTimeline`.
- Sidebar entry "Permits" with badge for "Awaiting my approval".

**Notifications**
- `permit_submitted`, `permit_decision`, `permit_activated`, `permit_expiring_soon` (T-2h), `permit_expired`, `permit_suspended`.

**Tests**
- `permit-fsm.test.ts` — every legal/illegal transition.
- `permit-expiry.test.ts` — sweep correctness.
- `permit-asset-block.test.ts` — expired asset blocks activation.
- `permit-rls.test.ts` — cross-BU read denied.

**DoD**
A worker submits a hot-work PTW → 4 approvers act in order → Permit activates → LOTO steps locked/verified → time elapses → permit auto-expires → notifications dispatched → audit log complete.

---

## Phase 3 — Training & SOP

Role-based assignment, scroll-lock reading time, randomised quiz ≥80%, escalation on overdue.

**Schema**
- `safety_sops` (id, code, title, version, body_md, attachments jsonb, min_read_seconds, is_active).
- `safety_quizzes` (sop_id, pass_threshold default 80).
- `safety_quiz_questions` (quiz_id, prompt, options jsonb, correct_index, weight).
- `safety_training_assignments` (user_id, sop_id, assigned_by, assigned_at, due_at, status: pending|in_progress|passed|failed|overdue, attempts_count).
- `safety_training_attempts` (assignment_id, started_at, finished_at, score, passed, answers jsonb).

**RPCs**
- `assign_sop_to_role(sop_id, safety_app_role, bu_id?, due_in_days)` — bulk insert filtered by `safety_user_roles`.
- `start_attempt`, `submit_attempt(answers)` — server scores, marks `passed=score>=threshold`.
- Cron `training-overdue-sweep` daily → marks overdue, notifies user + line manager + Safety Head after N days.

**UI**
- `/safety/training` (My assignments, scroll-lock reader enforces `min_read_seconds`, randomised quiz, retry policy).
- `/safety/training/admin` (SOP CRUD, quiz builder, role assignment, completion dashboard).

**Tests**
- Reader cannot submit before `min_read_seconds`.
- Quiz randomisation is deterministic per attempt.
- Pass/fail thresholding correct.
- Overdue cron escalation.

**DoD**
Admin uploads SOP v1, assigns to all `worker` in BU=Plant-1 with 7-day due → users complete reader + quiz → pass/fail recorded → overdue users escalated → dashboard shows compliance %.

---

## Phase 4 — Asset & Calibration

Asset register, T-7/T-1/overdue alerts, expiry blocks PTW.

**Schema**
- `safety_assets` (id, asset_code unique, name, category, business_unit_id, department_id, location, manufacturer, model, serial_no, install_date, calibration_required bool, calibration_interval_days, calibration_expires_at, last_calibration_at, status: active|under_maintenance|retired).
- `safety_asset_calibrations` (asset_id, performed_by, performed_at, certificate_url, next_due_at, notes).
- `safety_asset_evidence` (photos/manuals).

**RPCs**
- `record_calibration(asset_id, performed_at, certificate_url, next_due_at)` — updates asset row in same tx.
- Cron `asset-calibration-sweep` daily → emits T-7, T-1, overdue notifications and writes to `safety_notifications`.

**UI**
- `/safety/assets` register with filters (BU, category, expiry window).
- `/safety/assets/:id` with calibration history + evidence.
- Bulk CSV import.

**PTW link**
- Phase 2's `activate_permit` queries `safety_assets` — finalised here.

**Tests** — sweep correctness, PTW block on expiry, RLS cross-BU.

**DoD**
Asset register populated, calibration recorded, T-7/T-1/overdue alerts fire, expired asset blocks PTW activation, audit complete.

---

## Phase 5 — Audit & Compliance Checklists

Checklists, scoring, auto-incident on non-compliance, BU compliance scoreboard.

**Schema**
- `safety_audit_templates` (id, title, version, category, is_active).
- `safety_audit_template_items` (template_id, section, prompt, weight, critical bool, evidence_required bool).
- `safety_audit_runs` (template_id, business_unit_id, location, conducted_by, conducted_at, score, status: draft|submitted|reviewed).
- `safety_audit_run_responses` (run_id, item_id, answer: yes|no|na, score, notes, evidence_path, auto_incident_id NULL).

**Logic**
- On `submit_run`: any `critical=true && answer=no` triggers `create_safety_incident_from_audit(...)` server-side, links back via `auto_incident_id`.
- Score = Σ(weight × points) / Σ(weight) over non-NA items.

**UI**
- `/safety/audits/templates` (admin CRUD).
- `/safety/audits/runs/new` (mobile-friendly checklist).
- `/safety/audits/runs/:id` review.
- `/safety/audits/scoreboard` — BU heatmap, trend.

**Tests** — auto-incident creation, scoring formula, evidence_required enforcement.

**DoD**
Auditor runs a checklist on tablet → submits → score computed → 2 critical NOs auto-create 2 incidents → BU scoreboard updates.

---

## Phase 6 — Emergency Response

30-sec confirm countdown, broadcast, drill vs real mode, defaulter list, mandatory post-event report → auto incident.

**Schema**
- `safety_emergencies` (id, type: fire|gas|medical|evacuation|other, mode: drill|real, business_unit_id, location, triggered_by, triggered_at, ended_at, status: armed|active|stand_down|closed).
- `safety_emergency_acks` (emergency_id, user_id, ack_at, channel: app|sms|web).
- `safety_emergency_post_reports` (emergency_id, summary, lessons_learned, attachments jsonb, linked_incident_id).

**Flow**
- Trigger button → 30s countdown with cancel → on confirm, broadcast to all users in BU via `safety_notifications` + (future) SMS hook.
- Defaulter list = users in BU who did not ACK within X minutes.
- After `stand_down`, post-event report is mandatory; submission auto-creates an incident (type=`accident` or `near_miss`) linked back.

**UI**
- `/safety/emergency` (big red "Trigger" with countdown, mode toggle).
- `/safety/emergency/:id` live ack board, defaulter list.
- `/safety/emergency/:id/report`.

**Tests** — countdown cancel, ack timing, defaulter calculation, mandatory post-report → incident link.

**DoD**
Drill triggered → broadcast received → 90% ack within 5 min → defaulters listed → stand-down → post-report submitted → incident auto-created.

---

## Phase 7 — Analytics

TRIR, severity rate, open vs closed, training %, BU heatmaps, time-trends.

**Approach**
- Materialised views refreshed every 30 min by `safety-analytics-refresh` cron:
  - `mv_safety_trir` (rolling 12-month, per BU): TRIR = (recordable cases × 200,000) / hours_worked. Hours sourced from a new `safety_hours_worked` table (admin-entered monthly per BU).
  - `mv_safety_severity_rate`, `mv_incidents_open_vs_closed`, `mv_training_compliance`, `mv_audit_scoreboard`, `mv_permit_throughput`.
- Edge fn `safety-analytics` (already scaffolded) returns cached MV reads with optional date/BU filters.

**UI**
- `/safety/analytics` dashboard with cards (TRIR, LTI count, open incidents, training %, audit avg, PTW backlog) + charts (trend line, BU heatmap, severity stacked bar).
- Export to CSV/PDF (re-use PMS export pattern).

**Tests** — TRIR formula, MV refresh idempotency, role-scoped reads.

**DoD**
Dashboard renders within 1.5s, numbers reconcile with raw tables, BU filter works, exports succeed, only authorised roles see global view (others scoped to their BU).

---

## Cross-cutting tasks (do once, near the start)

- **Settings hub** `/safety/settings` index page collecting: Users (done), Master Data, Notifications, SLA matrix, PTW expiry warning offset, Training overdue policy, Analytics hours-worked entry. All values persisted in a new `safety_settings` (key, value jsonb) table — zero hardcoding.
- **Module Hub gating** — extend `useModules` so disabling Safety in `/admin/module-hub` removes it from the Hub within one realtime tick (already partly implemented; add a regression test).

---

## Status Tracker (mirrored at the top of `docs/safety-roadmap-phase2-7.md`)

```text
Phase  Sub-phase                        Status
0      Hub & Shell                      done
1      Incident Management (A–L)        done
A1     Image Compression (client+srv)   done   (bonus, outside original roadmap)
2      Permit to Work                   todo
3      Training & SOP                   todo
4      Asset & Calibration              todo
5      Audit & Compliance Checklists    todo
6      Emergency Response               todo
7      Analytics                        todo
X      Cross-cutting Settings hub       todo
```

---

## Execution protocol going forward

1. We pick **one** sub-phase from the tracker.
2. I produce a Risk & Impact Report (per workspace policy) for that sub-phase.
3. On approval, I implement schema → RPC → edge fn → UI → tests → docs/memory in that order, in a single coherent build.
4. We mark the row `done` in the tracker, then move to the next.

---

## What happens if you approve this plan

I will, in default mode:
1. Create `docs/safety-roadmap-phase2-7.md` containing this plan verbatim plus the Status Tracker.
2. Create `mem://features/safety/roadmap-phase2-7.md` pointing at that file and add it to `mem://index.md` under Memories.
3. Stop and wait for you to choose the first sub-phase to build (recommendation: **Phase 2 — Permit to Work**, since it is self-contained and unlocks the Phase 4 asset link later).
