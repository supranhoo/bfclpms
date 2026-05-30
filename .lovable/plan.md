# Phase 3 — Incident Workflow Enhancement Integration

Per `docs/safety-integration-governance.md` §Phase 3 (HIGH-RISK, human-approval gated). UI/UX-only enhancements to incident detail surfaces. **Zero workflow contract changes.**

## 1. Assumptions

- Production `transition_safety_incident` RPC and `rca` stage constant remain authoritative — no renames, no client-side status writes.
- `client_submission_id` idempotency, `['safety', ...]` cache prefix, and `has_safety_role()` RLS gates are untouched.
- Prototype repo (`justVedantt/safety`) is reference-only; we lift visual patterns, not code.
- Phase 1 baseline + Phase 2 polish are deployed and stable (confirmed via memory + `docs/safety/phase2/ux-polish.md`).

## 2. Clarifications

None blocking. If you want to scope down (e.g. only stage-aware copy, defer timeline grouping), say so before approval.

## 3. Risk & Impact Report

| Vector | Assessment | Mitigation |
|---|---|---|
| **Data** | None — no schema, RPC, RLS, or migration changes | Zero SQL in this phase |
| **Workflow** | None — `StageActionPanel` continues to call existing transition RPC unchanged | Forbid edits to `src/lib/safetyIncidents.ts` mutation paths; lint guard in PR description |
| **UI/UX** | Incident detail page gains stage-aware headings, day-grouped timeline, structured RCA panel layout | Behind a `safety_settings.ui_incident_v2` boolean flag (default ON in preview, gated in prod via existing settings hub) |
| **Regression** | Low — additive components, existing fallback path retained for one release | Keep legacy renderer importable for one cycle; remove only in Phase 8 |
| **Cache** | None — same query keys (`['safety','incident',id]`, `['safety','incident-timeline',id]`) | No new keys introduced |
| **Scalability** | Timeline grouping is O(n) over already-bounded history (≤ a few hundred rows per incident); RCA panel reads existing JSONB | No new queries, no N+1 |
| **Rollback** | Toggle `ui_incident_v2 = false` in `safety_settings` → instant revert to current UI | Verified before merge |

## 4. Step-by-Step Plan

| # | Step | Verification |
|---|---|---|
| 1 | Add `ui_incident_v2` boolean to `safety_settings` via additive migration (default `true` in non-prod, `false` in prod seed) | Migration runs clean; existing row updated; no other columns touched |
| 2 | Create `src/lib/incidentTimelineGrouping.ts` — pure function grouping `safety_incident_status_history` + `safety_incident_progress_log` by calendar day, stage-bucketed | Vitest unit tests: empty, single-day, multi-day, mixed-event ordering, DST boundary |
| 3 | Extend `IncidentTimeline.tsx` to accept `grouped` prop; when true, render day headers + stage chips. Default `false` preserves current behavior | Storybook-style snapshot test; existing callers unaffected |
| 4 | Create `src/components/safety/IncidentStageHeader.tsx` — reads current stage, renders stage-aware title + next-action hint pulled from `safety_settings.incident_stage_copy` (new JSONB column, additive) | Renders for every stage in `SAFETY_INCIDENT_STAGES`; falls back to stage key if copy missing |
| 5 | Create `src/components/safety/IncidentRcaPanel.tsx` — structured layout (5-why slots, contributing factors, corrective actions) reading existing `rca_payload` JSONB. **Read + edit via existing `transition_safety_incident('rca', payload)` only** | Submitting still routes through RPC; unit test asserts no direct `.from('safety_incidents').update(...)` call exists in new files |
| 6 | Wire flag gate in `SafetyIncidentDetail.tsx`: when `ui_incident_v2` true → render new header + grouped timeline + RCA panel; else current renderer | Toggle test in Vitest with mocked settings |
| 7 | Add settings UI row in `SafetySettings.tsx` under "Experimental UI" to flip the flag (admin-only, gated by `has_safety_role('admin')`) | Existing settings RPC handles write; ConfirmDestructiveDialog **not** required (non-destructive) |
| 8 | Update `DOCUMENTATION.md` (Safety §) and `POLICY.md` (§Phase 3 governance entry) + bump version history | grep confirms entries |
| 9 | Update memory: extend `mem://features/safety/hardening-baseline` notes with Phase 3 status; add new `mem://features/safety/incident-ux-v2` describing the flag, files, and rollback | Index updated |
| 10 | Update `docs/safety-roadmap-phase2-7.md` + `docs/safety/phase1/hardening-baseline.md` "Next" line to reflect Phase 3 shipped behind flag | grep confirms |

## 5. UI Changes

**Scope:** `/safety/incidents/:id` only. No route additions, no sidebar changes, no list-page changes.

| Element | Current | After (flag ON) | Responsiveness |
|---|---|---|---|
| Detail header | Static "Incident #X" + status badge | Stage-aware title (e.g. "Awaiting RCA — Investigation in progress") + next-action hint + status badge | Header stacks vertically `<md`; sticks on scroll on desktop only |
| Timeline | Flat reverse-chronological list | Day-grouped sections with stage chips, collapsible groups older than 7 days | Same list on mobile, grouping preserved; collapse defaults open `<md` to avoid hidden taps |
| RCA section | Free-text textarea | Structured panel: 5 numbered "Why" inputs, factors multi-select (from `safety_master_data`), corrective-actions list | Single-column `<md`, two-column `≥md` |
| Action panel | `StageActionPanel` unchanged | Unchanged — identical RPC wiring | Unchanged |

**Interaction impact:** no new clicks required to perform any existing action. Flag OFF → pixel-identical to today.

## 6. Implementation (Technical Notes)

- **Files added:** 4 (`incidentTimelineGrouping.ts`, `IncidentStageHeader.tsx`, `IncidentRcaPanel.tsx`, `src/test/safety/incidentTimelineGrouping.test.ts`).
- **Files edited:** 3 (`IncidentTimeline.tsx` — additive prop; `SafetyIncidentDetail.tsx` — flag gate; `SafetySettings.tsx` — single toggle row).
- **Migration:** 1 additive (`safety_settings` columns `ui_incident_v2 boolean DEFAULT false`, `incident_stage_copy jsonb DEFAULT '{}'`). No GRANT changes (table already granted). No new RLS policies (existing settings policies cover).
- **Backup:** Automatic via `public.get_backup_table_order()` — no allowlist edit needed (Core rule).
- **Forbidden in this phase:** any edit to `src/lib/safetyIncidents.ts` mutation helpers, `transition_safety_incident` SQL, `safety_incident_fsm_guard`, route table, role enums, query-key strings.

## 7. Tests

- `src/test/safety/incidentTimelineGrouping.test.ts` — 5 cases (empty, single day, multi-day ordering, mixed event types, DST/timezone boundary).
- `src/test/safety/incidentRcaPanel.test.tsx` — asserts submit handler calls `transition_safety_incident` (mocked) with `to_stage='rca'`; asserts file contains **zero** direct `from('safety_incidents').update` references (regex check).
- `src/test/safety/incidentDetailFlagGate.test.tsx` — flag OFF renders legacy markers; flag ON renders new header + grouped timeline.
- Existing Phase 1/2 Safety test suite must remain green.

## 8. DOCUMENTATION.md Updates

- New §"Safety Phase 3 — Incident UX v2" describing flag, components, rollback.
- Version history bump: `v2.66.13.20 — Safety incident detail UX v2 (flagged)`.

## 9. POLICY.md Updates

- New §"Safety Governance Phase 3" entry confirming: UI-only, flag-gated, RPC contract preserved, rollback = flip flag.
- Cross-reference governance standard §Phase 3 checklist completion.

## 10. Post-Implementation Notes

- Default `ui_incident_v2 = false` in production until safety-head sign-off recorded.
- Phase 4 (offline/evidence UX) remains blocked pending its own approval gate.
- Removal of legacy renderer scheduled for Phase 8 stabilization, not this phase.

---

**Approval needed from:** Architecture + Product Owner + Engineering Manager (per governance §Phase 3 gate). On approval I'll request the migration first, wait for your green-light, then ship the UI in a single follow-up commit.
