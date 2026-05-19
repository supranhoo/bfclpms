## Goal

Drive the Safety module from its current state to "production-complete" by executing the 9 phases (0–8) in `docs/safety-integration-governance.md`. Production `bfclpms` Safety stays authoritative; the prototype is a feature-idea source only. Each phase is a separate Lovable run with its own approval gate, file allowlist, tests, and rollback.

## Current baseline (verified)

- **Routing/shell**: `SafetyLayout` + `SafetySidebar` isolated under `/safety/*`, `SafetyModuleRoute` gates access (module flag + `safety_user_roles`).
- **Pages live**: Home, Incidents (+New/Detail), Permits (+New/Detail/TypeConfig), Assets (+New/Detail), Audits (Templates/Runs/Scoreboard/Log), Drills, Training (+Admin), Emergency (+Contacts), HoursWorked, SlaMonitor, Analytics, Users, Settings.
- **Components**: filter bar / data table / mobile card / sticky action bar / empty state primitives, status & SLA badges, evidence list, incident timeline, stage action panel, notification bell, offline badge.
- **Backend**: edge functions `check-safety-sla`, `grant-safety-role`, `safety-analytics`; RBAC via `safety_user_roles` + `has_safety_role()` SECURITY DEFINER; offline queue in `safetyOfflineQueue.ts`; manual-fetch + pagination policy (ADR-050).
- **Memory locked**: shell isolation, manual-fetch policy, mobile UX, RBAC, offline queue, realtime, SLA, audit checklists, emergency, analytics, settings hub, test gate.

So the work is **gap-closing + hardening + selective prototype-derived UX**, not a rebuild.

---

## Phase plan

### Phase 0 — Read-only discovery (no approval needed)

**Deliverables** (all under `docs/safety/phase0/`):
- `routes-diff.md` — production `/safety/*` tree vs prototype.
- `schema-diff.md` — Safety tables / enums / RLS vs prototype.
- `rpc-diff.md` — `has_safety_role`, `has_safety_module_access`, incident transition RPCs, SLA RPC vs prototype.
- `functions-diff.md` — edge functions inventory + auth posture.
- `cache-and-querykeys.md` — Safety query-key namespaces.
- `idempotency-and-offline.md` — `client_submission_id` contract + IndexedDB queue.
- `gap-checklist.md` — feature-by-feature gap list with classification (Keep / Candidate / Conditional / Reject).

**Forbidden**: any file edit outside `docs/safety/phase0/`.

---

### Phase 1 — Production hardening validation (recommended approval)

**Deliverables** (`docs/safety/phase1/`):
- Security audit: every Safety table has RLS on + policies reviewed; `security--run_security_scan` clean for Safety scope.
- RLS matrix per role × table.
- Backup coverage confirmation (snapshot tables, retention).
- Module-isolation regression: extend `src/test/safetyShellIsolation.test.tsx` if any new cross-imports appeared.
- Edge-function auth posture: confirm `grant-safety-role` is admin-gated, `check-safety-sla` is cron-only, `safety-analytics` enforces role.
- Add `mem://features/safety/hardening-baseline` capturing the verified state.

**Forbidden**: runtime code changes, schema changes.

🛑 **Approval gate (Architect + EM + PO)** before Phase 2.

---

### Phase 2 — Low-risk Safety UI polish (REQUIRED approval)

Allowlist: `src/components/safety/**`, `src/pages/safety/**`, `src/index.css` (tokens only). No hook/lib/service edits.

Scope (gap-driven, prioritized):
1. Loading skeletons for every list page (Incidents, Permits, Audits, Assets, Drills, Training, HoursWorked, SlaMonitor) — replace spinner blocks with `Skeleton` rows matching `SafetyDataTable` columns.
2. Empty-state coverage audit — every list uses `SafetyEmptyState` (`awaiting-search` / `no-results`).
3. Mobile parity sweep — verify every list page renders `SafetyMobileListCard` via `SafetyResponsiveList`; add missing `mobileRender` for HoursWorked + SlaMonitor.
4. SLA visual polish — color tokens for at-risk/breached, tooltip on `SlaBadge`.
5. Sticky action bar consistency — Incident, Permit, Drill, Audit-run *New* pages all submit via `SafetyStickyActionBar`.
6. Accessibility pass — `aria-label` on icon-only buttons, focus rings, 44px tap targets.

Tests: extend `safetyMobileLayout.test.tsx`, add `safetyEmptyStateCoverage.test.ts` (static grep), `safetySkeletonCoverage.test.ts`.

Rollback: revert the UI files (no schema/contract risk).

🛑 **Approval gate (Architect + Safety PO + Tech Lead)** before Phase 3.

---

### Phase 3 — Incident workflow UX (HIGH-RISK, REQUIRED approval)

Allowlist: `src/components/safety/IncidentTimeline.tsx`, `StageActionPanel.tsx`, `src/pages/safety/SafetyIncidentDetail.tsx`, presentation hooks only. No edits to transition RPC, no status writes outside the existing transition wrapper.

Scope:
1. Clarify stage labels using production constants (no renames in DB/RPC).
2. Inline guidance per stage in `StageActionPanel` (who acts next, required fields).
3. RCA/CAPA panel polish — read-only display improvements + form validation; preserve `rca` constant.
4. Idempotency surfacing — show `client_submission_id` + retry status in detail header.
5. Audit timeline grouping by day.

Tests: `incidentTransitionContract.test.ts` (static — assert UI only calls the canonical transition helper), happy-path render test per stage.

Rollback: revert touched workflow UI files; no DB change.

🛑 **Approval gate (Architect + Platform Lead)** before Phase 4.

---

### Phase 4 — Offline sync & evidence UX (MED/HIGH, REQUIRED approval)

Allowlist: `src/components/safety/SafetyOfflineBadge.tsx`, `EvidenceList.tsx`, incident/permit/audit *New* pages, plus a **read-only** view layer over `safetyOfflineQueue.ts`. No edits to the queue write path or `client_submission_id` generation.

Scope:
1. Offline badge → opens a queue inspector sheet (pending/syncing/failed counts, last error, manual retry).
2. Evidence upload: per-file progress, retry-failed-only, camera-capture fallback messaging.
3. Conflict UX — when server rejects a queued item, show the diff and provide "discard local" / "open server copy".
4. Drift indicator on incident detail when local copy differs from server.

Tests: `safetyOfflineQueueReadOnly.test.ts` (asserts UI never mutates queue internals), evidence retry test.

🛑 **Approval gate (Architect + Security + IR Lead)** before Phase 5.

---

### Phase 5 — Emergency features (feature-flagged, HIGH-RISK)

Allowlist: `src/pages/safety/SafetyEmergency.tsx`, `SafetyEmergencyContacts.tsx`, a new `src/lib/safetyFeatureFlags.ts`, scoped overlay component under `src/components/safety/emergency/*`.

Scope:
1. `safety_emergency_overlay` flag in DB (additive table `safety_feature_flags`), default OFF.
2. Overlay mounts **only inside `SafetyLayout`** — never global — guarded by flag + role.
3. One-tap dial buttons already in production; extend with "Notify on-site responder" via existing channels (no new providers).
4. Kill switch documented in Settings.

Tests: flag-off baseline (overlay absent), flag-on render, isolation test (overlay does not import outside Safety).

Rollback: flip flag, then revert UI.

🛑 **Approval gate (Architect + Security + Data Gov)** before Phase 6.

---

### Phase 6 — Admin / import (HIGH-RISK, REQUIRED approval)

Allowlist: `src/pages/safety/SafetyUsers.tsx`, `SafetySettings.tsx`, new `src/pages/safety/SafetyImport.tsx`, an admin-only edge function `safety-bulk-import` with dry-run mode.

Scope:
1. CSV import for: Assets, Training assignments, Emergency contacts. Hours-worked import already exists — bring under the same pattern.
2. **Mandatory**: schema validation → dry-run preview → confirm dialog (`ConfirmDestructiveDialog`) → write with audit log row per record.
3. Admin role check at edge + RLS + UI.
4. Rollback: every import gets a batch ID and a one-click "Revert this import" within 24h.

Tests: dry-run produces zero writes; non-admin blocked at edge; rollback restores prior state.

🛑 **Approval gate (Architect + Analytics Lead)** before Phase 7.

---

### Phase 7 — Analytics enhancements (MEDIUM, REQUIRED approval)

Allowlist: `src/pages/safety/SafetyAnalytics.tsx`, `src/lib/safetyAnalytics.ts` (read-side only), chart components. No changes to `safety-analytics` edge function contract.

Scope:
1. TRIR / LTIFR / severity-rate cards from existing datasets.
2. Trend charts (incidents by type / month, permit volume, audit score trend, training compliance %).
3. Filters: date range, BU, department — using existing manual-fetch primitives.
4. Export to Excel (reuse existing export util).

Tests: render + filter snapshot, export contract.

🛑 **Approval gate (EM + QA + Release Mgr)** before Phase 8.

---

### Phase 8 — Final stabilization & regression (LOW-RISK validation)

Deliverables (`docs/safety/phase8/`):
- PMS regression checklist run (auth, dashboards, KPI flows, reports, admin).
- Safety regression checklist (every page from Phase 1 baseline).
- Cache/realtime audit — confirm Safety invalidations remain scoped.
- Rollback drill report for Phases 3, 5, 6.
- Monitoring dashboards configured: route error rates, transition errors, submission failures, duplicate-incident anomalies, offline-sync failures, evidence-upload failures, permission-denied anomalies, Safety API latency.
- Final release-readiness sign-off document.

---

## Cross-cutting governance (enforced every phase)

- **One objective per PR**, explicit file allowlist in the PR description; any out-of-scope file invalidates the PR.
- **Stop conditions** from the standard (§Stop Conditions) are wired as pre-commit checks where feasible (route rename detection, workflow-constant grep, schema-rewrite detection).
- **No prototype role model** ever merged — `safety_app_role` stays authoritative.
- **No prototype route tree** — `/safety/*` map is frozen; new pages only as additive children.
- **Stage names**: keep production constants (`rca`, not `root_cause_analysis`); any prototype-derived label change is **display-only**.
- **Idempotency**: `client_submission_id` only; never introduce `idempotency_key`.
- **Cache namespaces**: Safety query keys stay isolated from PMS keys.
- **Memory updates** at the end of each phase: extend the relevant `mem://features/safety/*` file with what shipped + what's now locked.
- **POLICY.md / DOCUMENTATION.md / ADR**: each phase adds an ADR (`docs/adr/ADR-065`…) and updates POLICY.md + DOCUMENTATION.md atomically.

## Risk & impact (overall)

- **Data**: no schema rewrites; Phase 5 adds `safety_feature_flags` (additive), Phase 6 adds `safety_import_batches` + audit rows (additive).
- **Workflow**: untouched at the contract level; only display.
- **Auth/roles**: untouched; `safety_user_roles` stays sole source.
- **UI/UX**: gradual, design-token-driven.
- **Regression**: bounded by allowlists + per-phase tests + manual approval gates.

## What I need from you to start

1. **Approve this overall plan** (then I'll execute Phase 0 immediately — read-only, no approval needed for Phase 0 deliverables themselves).
2. Confirm the **phase ordering** — happy to swap Phase 4 ↔ Phase 3 if offline UX is more urgent than incident workflow polish.
3. Confirm the **Phase 6 import scope** (Assets / Training / Emergency contacts) — add or remove entities here.

After approval, I'll run Phase 0, present the gap checklist, and pause for the Phase-2 gate per the standard.