# Safety Module — Phase 1 Plan (Brainstorm + Build Spec)

## 0. Context confirmed in current codebase

- Hub is **already DB-driven** via `public.modules` (`is_enabled`, `display_order`). Only `pms` row exists today. → Admin on/off requirement is satisfied by a single row + a tiny admin toggle UI; no schema changes needed for visibility.
- `useModules()` returns only `is_enabled = true` rows. We will extend it with a per-user access join so revoking a user's Safety access also hides the card (not just the global toggle).
- No prior `safety_*` tables, hooks, components, or edge functions exist. This is greenfield — clean port from your reference source.
- `ALL_APP_ROLES` is the SSOT for PMS roles (`src/lib/roles.ts`). Safety roles will live in a **separate enum** (`safety_app_role`) and a separate `safety_user_roles` table to preserve the SSOT discipline and avoid polluting PMS RBAC.

---

## 1. Engineering recommendations (additions / refinements to your spec)

These are the deltas I recommend on top of your written spec. Each is non-blocking — call out which to drop before I build.

1. **Two-layer visibility, not one.**
  Keep `modules.is_enabled` as the **global kill-switch** (Admin → Module Hub Settings) AND introduce `safety_module_access` as the **per-user grant**. The Hub card is shown only when both are true. This lets you pilot Safety with 5 users before flipping the global switch.
2. **Module-scoped Admin role.**
  `admin` in PMS today is god-mode. For Safety we should require `safety_app_role = 'admin'` separately. A PMS admin who is not granted Safety admin sees the hub card only if explicitly granted. This prevents accidental cross-module privilege creep and matches your "RLS-first" directive.
3. **Single FSM transition entry point — enforce at DB, not app.**
  Your spec already has `transition_safety_incident` + a BEFORE UPDATE trigger checking `current_setting('safety.fsm_transition','true')`. Endorsed. Add the same guard for `safety_incident_tickets.ticket_status` and `safety_incident_status_history` inserts so no path can backdoor a state change.
4. `**incident_number` generation — sequence + advisory lock.**
  Use `nextval('safety_incident_number_seq')` inside a trigger with `pg_advisory_xact_lock(hashtext('safety_incident_number'))` to guarantee no duplicates under concurrent inserts (offline replays will hit this).
5. **Offline duplicate guard — client UUID, not composite key.**
  Your composite `(reporter_id, title, created_at::date, location)` will false-positive on legitimate same-day reports. Recommend: client generates `client_submission_id uuid` and DB has `UNIQUE (reporter_id, client_submission_id)`. Cleaner and idempotent.
6. **Evidence model — one table, not jsonb + side table.**
  Drop `safety_incidents.media_urls jsonb`. Use `safety_incident_evidence` exclusively with a `stage` enum column (`report`, `assignment`, `investigation`, `rca`, `capa`, `verification`). Closure trigger checks `EXISTS (… stage='verification')`. Single source of truth for files + cleaner RLS.
7. **SLA — store the deadlines, compute escalation status as a generated column.**
  `acknowledge_due_at`, `close_due_at` are stored at insert/severity-change. Add `sla_state text GENERATED ALWAYS AS (...) STORED` so the UI chip and reports agree on amber/red without app-side drift.
8. **Realtime invalidation — keep your "all-or-nothing" rule but scope by module.**
  `invalidateAllSafetyQueries(qc)` should invalidate only keys prefixed `['safety', …]` so it does not nuke PMS caches when a Safety event fires. Mirrors the `useProfilesVersion` pattern already in PMS.
9. **Notifications — reuse existing dispatch engine, add a `module` discriminator.**
  The PMS notification engine and `notifications` table already exist. Add `module text default 'pms'` and let Safety push events through the same pipeline. Avoids two unread-counts, two bells, two cron jobs.
10. **Hub card visibility = realtime.**
  Subscribe `useModules()` to changes on `safety_module_access` filtered by `user_id=auth.uid()` so revocation hides the card within one tick (matches your acceptance criterion in 1.A).
11. **Audit log — single table for both modules, partitioned by `module`.**
  Instead of `safety_assignment_audit_log`, extend the existing audit trail with a `module` column. One queryable surface for compliance, two views over it.
12. **Tests — add a smoke test that proves PMS chrome never renders inside `/safety/*` and vice versa.** Catches the "polluted shell" regression you explicitly called out.

---

## 2. Phase 0 — Hub & Decoupled Shell

### Deliverables

- Insert Safety row into `modules` (admin-toggleable from a new `/admin/modules` page — 1 toggle, 1 page, ~80 LOC).
- `SafetyLayout.tsx` (new) — owns its own `Sidebar`, `MinimalHeader` variant, `NotificationBell` (filtered by `module='safety'`), idle timeout, `useSafetyRealtimeSync`.
- `SafetySidebar.tsx` — Safety menu only.
- Routes in `App.tsx` (lazy-loaded, behind `<SafetyModuleRoute>` guard that checks `safety_module_access` for the current user).
- Hub card visibility: `useModules` extended to LEFT JOIN `safety_module_access` for the current user; Safety card hidden when no row.

### Acceptance

- Login → Hub → Safety card visible only if granted → click → `/safety` with Safety-only chrome → `/safety/*` never renders PMS sidebar → back to Hub works.

---

## 3. Phase 1.A — Permissions & User Management

### Schema (one migration)

- Enum `safety_app_role`: `admin, safety_head, safety_officer, bu_head, manager, supervisor, worker, auditor`.
- `safety_user_roles (id, user_id, role, business_unit_id NULL, department_id NULL, assigned_by, assigned_at)` — UNIQUE on the four-tuple.
- `safety_module_access (user_id PK, can_view bool, can_edit bool, granted_by, granted_at)`.
- `has_safety_role(_uid uuid, _role safety_app_role, _bu uuid default null) → bool` — SECURITY DEFINER, mirrors `has_role`. Used in every Safety RLS policy to prevent recursion.
- Audit row in shared audit table on every grant/revoke.

### UI: `/safety/settings/users`

- Searchable list from `profiles` (filter `is_active=true`).
- Per-user matrix: rows = Safety modules (incidents, permits, training, …), columns = role assignments scoped to BU/Dept multi-select.
- Bulk CSV import (reuse PMS import patterns).
- All mutations through `safety-rbac-mutate` edge function (audit-logged).

---

## 4. Phase 1.B — Incident Schema (3 migrations to keep restores clean)

**Migration 1 — enums + master data**
`safety_incident_status`, `safety_incident_severity`, `safety_incident_type`, `safety_master_data` seeded.

**Migration 2 — core tables**
`safety_incidents` (with `incident_number`, `client_submission_id`, severity-driven SLA cols, `sla_state` generated), `safety_incident_timeline` (`changed_by`, casted enums), `safety_incident_status_history`, `safety_incident_tickets`, `incident_progress_logs`, `safety_incident_evidence`.

**Migration 3 — guards + realtime**

- BEFORE UPDATE trigger blocking direct status writes unless `current_setting('safety.fsm_transition','true')`.
- Closure trigger: requires verification_notes + ≥1 progress log + ≥1 evidence row with `stage='verification'`.
- `REPLICA IDENTITY FULL` on the three realtime tables.
- Add tables to `supabase_realtime` publication.
- Storage bucket `safety-media` (private) + RLS policies for reporter/assignee/officer/head/admin/BU-head.

---

## 5. Phase 1.C/D — FSM Engine & Permission Matrix

7-stage FSM: `reported → assigned → investigation → rca → corrective_action → verification → closed` + `orphaned` exception.

- `transition_safety_incident(p_incident, p_to_status, p_user, p_notes, p_assigned_to)` — sequential index check, per-stage preconditions per your spec.
- `approve_incident_safety(p_ticket, p_user)` — Safety Head closure path; sets the FSM session flag, atomic update of ticket+incident, writes timeline row with explicit casts, audit log.
- Permission matrix exactly as you specified (table reproduced in `POLICY.md`).
- UI: suppress generic "Advance to: verification" card; closure flows only via Approval Workflow panel.
- Edge function envelope: `{ ok, error?, result? }` — never throws.

---

## 6. Phase 1.E — SLA Engine

- Deadlines stored on insert (`acknowledge_due_at = created_at + 24h`; `close_due_at` from severity table).
- `sla_state` generated column drives UI + reports.
- Cron edge fn `check-safety-sla` every 15 min via `pg_cron` → escalation notifications via shared engine.
- `SlaCountdown` chip on every list row.

---

## 7. Phase 1.F — Evidence

- Single table `safety_incident_evidence (id, incident_id, stage, file_url, file_name, mime, size_bytes, uploaded_by, uploaded_at)`.
- Reporter: ≥1 file at submission, ≤5 files, ≤20 MB each, mime allow-list `image/*, video/mp4, application/pdf`.
- Verification: ≥1 row with `stage='verification'` enforced by closure trigger.
- Downloads via `safety-incident-evidence` edge fn (signed URL + role check).

---

## 8. Phase 1.G/H — Notifications, Realtime, Offline

- Reuse PMS `notifications` table; add `module` column. One bell, one cron, two filters.
- `invalidateAllSafetyQueries(qc)` invalidates only `['safety', …]` keys.
- IndexedDB queue (`offlineIncidentDb.ts`) keyed by `client_submission_id`. Reconnect → flush → DB UNIQUE prevents dupes.
- All edge fns return `{ ok:false, error }` envelope; UI surfaces actual DB error.

---

## 9. Phase 1.I — UI Surfaces

`SafetyHome`, `IncidentList` (role-scoped), `IncidentForm` (cascading type→severity, BU→dept, mandatory location, mandatory involved person for `unsafe_act`/`accident`, mandatory media), `IncidentDetail` with side panels (Assignment, Progress, Closure, Approval, Evidence, Orphan, SyncStatus, SlaCountdown). All destructive actions use `ConfirmDestructiveDialog`.

---

## 10. Phase 1.J — Audit & Compliance

- Every status change → `safety_incident_timeline` (auto via RPC).
- Every RBAC mutation + every evidence upload/download → shared audit table with `module='safety'`.
- Read-only Audit Logs page filtered by `incident_id`.

---

## 11. Phase 1.K — Tests (gate for Phase 2)

Port from your reference + add the chrome-isolation test:
`workflow-rpc`, `workflow-enforcement`, `role-access`, `sla-calculation`, `escalation-triggers`, `incident-locking`, `**shell-isolation**` (asserts no PMS sidebar in `/safety/*` DOM and vice versa).

---

## 12. Risk & Impact Report (mandated by workspace knowledge)


| Area          | Risk                                                 | Mitigation                                                                                                                              |
| ------------- | ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Data          | New `safety_*` schema; zero overlap with PMS tables. | Separate enum + table namespace; no FK into PMS data except `auth.users(id)` and `profiles(id)`. No PMS row touched.                    |
| RLS           | New policies must not introduce recursion.           | All policies route through `has_safety_role()` SECURITY DEFINER (mirrors PMS `has_role`).                                               |
| Workflow      | FSM bypass via direct UPDATE.                        | BEFORE UPDATE trigger + session flag pattern. Tests cover every illegal transition.                                                     |
| UI            | Safety chrome leaks into PMS routes (or vice versa). | Decoupled `SafetyLayout`; `shell-isolation` test in Phase 1.K.                                                                          |
| Notifications | Two bells / two unread counts.                       | Single shared table with `module` discriminator; bell filters by current shell.                                                         |
| Cache         | Safety realtime invalidates PMS queries.             | `invalidateAllSafetyQueries` scoped to `['safety', …]` keys only.                                                                       |
| Offline       | Duplicate incidents on reconnect.                    | `client_submission_id uuid` + DB UNIQUE (reporter_id, client_submission_id).                                                            |
| Regression    | PMS users lose features.                             | Zero edits to existing PMS files except `App.tsx` (route add), `ModuleHub.tsx` (already DB-driven), `useModules.ts` (LEFT JOIN access). |
| Compliance    | Closure without proof.                               | Closure trigger checks notes + progress log + verification evidence.                                                                    |
| Rollback      | Migration restores break.                            | 3 separate migrations (enums → tables → guards) so partial rollback is clean.                                                           |


---

## 13. Decisions I need from you before I start building

1. **Confirm the 11 recommendations in §1** — accept all, or call out which to drop.
2. **Initial Safety admin user** — should I seed the first `safety_app_role='admin'` row for your account on migration, or leave the table empty and use a bootstrap edge fn? - Answer - use admin accounts as admin here also  
3. **BU/Dept source** — should Safety reuse PMS `companies/departments` tables, or have its own `safety_business_units`? (My recommendation: reuse PMS — single org tree, less drift.) Answer - reuse PMS 
4. **Phase 0 scope** — do you want me to ship Phase 0 (Hub + shell + empty pages) as a standalone PR first, then Phase 1 in a second PR? Or one big drop? Answer One by One 

Once you answer these, I will switch to build mode and ship Phase 0 + 1.A in the first turn (foundation: shell + RBAC + admin toggle + tests), then 1.B–1.L in subsequent turns so each is reviewable.

---

## ✅ Status — Phase 1.A delivered

- Migration shipped: `safety_app_role` enum, `safety_user_roles` table (unique across user/role/BU/dept with NULL-safe index), `has_safety_role()` + `has_any_safety_role()` SECURITY DEFINER helpers, `safety_audit_log` table + trigger, `has_safety_module_access()` extended to include role-based grants.
- SSOT: `src/lib/safetyRoles.ts` (8 roles + label/description maps).
- Hooks: `src/hooks/useSafetyRoles.ts` (`useAllSafetyUserRoles`, `useMySafetyRoles`, `useGrantSafetyRole`, `useRevokeSafetyRole`).
- UI: `/safety/settings/users` (`src/pages/safety/SafetyUsers.tsx`) — search + grant + revoke. Sidebar item live.
- Memory + POLICY synced: `mem/architecture/safety/rbac.md`, POLICY §111.

**Next:** Phase 1.B — incident schema (enums + master data + core tables + FSM guards), in three migrations.
---

## ✅ Status — Phase 1.B delivered

- **Schema:** enums (`safety_incident_status/severity/type`, `safety_evidence_stage`), `safety_severity_sla` master data, `safety_incident_number_seq`, `safety_incidents` (with `client_submission_id` UNIQUE for offline dedup), `safety_incident_timeline`, `safety_incident_evidence`, `safety_incident_progress_logs`.
- **SLA exposure:** `safety_incidents_with_sla` view (`security_invoker=true`) replaces the originally-planned generated column (Postgres immutability constraint on `now()`).
- **FSM guard:** `safety_incident_fsm_guard` BEFORE UPDATE trigger blocks direct `status` writes; only `transition_safety_incident()` RPC can advance stages.
- **RPC:** sequential-only, per-stage preconditions (assignee on `→ assigned`; notes + ≥1 progress log + ≥1 verification evidence on `→ closed`); returns `{ok,error?}` envelope.
- **Insert hooks:** auto `INC-YYYY-######` numbering under advisory lock, severity-driven SLA deadlines.
- **RLS:** `can_view_safety_incident()` SECURITY DEFINER helper drives SELECT for incidents/timeline/evidence/progress; only `admin` deletes incidents.
- **Storage:** private `safety-media` bucket with folder-scoped writes, officer-or-above reads, admin-or-uploader deletes.
- **Frontend SSOT:** `src/lib/safetyIncidents.ts`. Hooks: `src/hooks/useSafetyIncidents.ts`. List page: `/safety/incidents`.
- **Docs:** POLICY §112, `mem/architecture/safety/incident-fsm.md`.

---

## ✅ Status — Phase 1.C delivered

- **Form:** `/safety/incidents/new` — title/description/location/type/severity required, BU→Dept cascade, "Involved person" mandatory for `unsafe_act`/`accident`, ≥1 evidence file at submit (max 5 × 20 MB, allow-list `image/* | video/mp4 | application/pdf`), submit creates incident then uploads files into `safety-media/<uid>/<incidentId>/report/...` and redirects to detail.
- **Detail:** `/safety/incidents/:id` — header card with status + SLA badges, four-card grid (Stage Actions, Status Timeline, Evidence, Progress Log).
- **Stage Action Panel** — single, opinionated UI per stage:
  - `reported` → mandatory assignee picker.
  - `rca` / `corrective_action` / `verification` → editable text field saved before transition (so the FSM closure check sees `verification_notes`).
  - Stage-aware evidence uploader (one button per stage, mapped via `STAGE_TO_EVIDENCE`).
  - Always-on progress note input (⌘/Ctrl+Enter to save).
  - Single "Advance to N+1" button — never a free-form status picker. All transitions go through `useTransitionSafetyIncident()` (RPC).
- **Hooks:** `useSafetyOrg.ts`, `useSafetyIncidentDetail.ts` (timeline, progress, evidence, signed-URL helper, notes patch).
- **Sub-components:** `StatusBadge`, `SlaBadge`, `IncidentTimeline`, `ProgressLogList`, `EvidenceList` (signed-URL on click).
- **Policy invariant maintained:** UI never calls `update({ status })` and never inserts into `safety_incident_timeline`. Only the RPC moves stages. All cache invalidation stays under `['safety',...]`.

**Next:** Phase 1.D — SLA escalation cron + notifications (`check-safety-sla` edge fn). Phase 1.E — offline IndexedDB queue keyed by `client_submission_id`.
