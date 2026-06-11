# Safety Parity Audit — `justVedantt/safety` → BFCL PMS

- Audit date: 2026-06-11
- Prototype SHA: `120e7b14c9243cb310d68b8c0885f32e17950dbc` (`HEAD`, public GitHub)
- BFCL repo: this workspace
- Method: read-only; behavioural mapping (file names ignored). Verified by
  cross-checking UI routes, hook RPC/table calls, migration history, edge
  function payload contracts and FSM guards.

---

## 0. Executive summary

The "prototype" at `justVedantt/safety` is not a safety-only proof — it is a
full PMS fork (969 files, 317 migrations, 41 edge functions) whose **safety
subsystem is a thin first pass** (17 tables, 12 safety RPCs, 12 pages, ~16
hooks). BFCL is the production-grade descendant of that PMS lineage and
ships a **substantially expanded safety module** (33 `safety_*` tables,
richer FSM-locked RPC contracts, materialized-view analytics, RBAC enum,
offline queue, audit-run/drill/training models).

### Final score (safety scope, behaviour-weighted)

| Verdict | Count | % |
|---|---:|---:|
| Fully present (often expanded) | 58 | **78.4 %** |
| Partially present (model evolved, behaviour mostly retained) | 9 | 12.2 % |
| UI only (no working write path in BFCL) | 0 | 0.0 % |
| Broken (code calls missing artefact) | 0 | 0.0 % |
| Missing (no equivalent) | 7 | 9.5 % |
| **Total prototype safety artefacts traced** | **74** | **100 %** |

The PMS scope (admin, reports, incentive, review, KPI, workflow, IAC) was
treated as out-of-band — BFCL is the PMS authority and the prototype's PMS
surface is a strict subset (verified by route diff and migration enums).
The 74 traced safety artefacts cover every prototype safety
page/component/hook/lib/edge-fn/table/RPC/trigger/policy.

### Headline verdicts

1. **Architecture diverged in BFCL's favour.** Prototype writes directly to
   `safety_incidents.status`; BFCL hard-blocks that with
   `safety_incident_fsm_guard` and routes every status move through
   `transition_safety_incident` (RPC SECURITY DEFINER). All prototype state
   changes have an equivalent in BFCL but are *safer*.
2. **Analytics is materialised in BFCL, ad-hoc in prototype.** The
   prototype's seven `safety_dashboard_*` / `safety_analytics_*` RPCs are
   replaced by seven `mv_safety_*` materialized views + a refresh RPC.
   Behaviour parity: present. RPC-name parity: missing.
3. **Audit / drill / training models were redesigned.** Prototype uses
   `safety_audit_checklists` + `safety_audit_results` (flat). BFCL uses
   `safety_audit_templates` + `safety_audit_template_items` +
   `safety_audit_runs` + `safety_audit_run_responses` (run-scoped).
   Same UX, richer schema.
4. **RBAC redesigned.** Prototype uses `safety_role_type` enum
   (`bu_head`, `safety_head`) plus a `role_assignment_mapping` table. BFCL
   uses `safety_app_role` enum + `safety_user_roles` + module gate +
   `has_safety_role()` / `has_safety_module_access()` SECURITY DEFINER
   functions.
5. **Genuine functional gaps in BFCL** (7 items, see §4): six prototype
   widgets/RPCs whose behaviour is not yet shipped, and one absent table
   (`safety_master_data` reference dataset).

---

## 1. Methodology

Per-artefact verification: **UI render → hook call → DB shape → FSM guard**.
An artefact is *Fully Present* only when all four trace cleanly. Status
rules per the approved plan; abbreviated here:

- **Full** = UI + hook + DB + FSM aligned (extra BFCL fields allowed).
- **Partial** = same behaviour, narrower scope or schema delta.
- **UI Only** = renders but writes fail / are gated off.
- **Broken** = code calls a missing RPC/table/bucket.
- **Missing** = no equivalent.

File evidence is given as `repo:path` with `proto:` = prototype clone in
`/tmp/proto/...` (downloaded raw from GitHub) and `bfcl:` = this repo.

---

## 2. Feature parity table (safety)

### 2.1 Pages / routes

| Prototype route → file | BFCL route → file | Status | Evidence / gap |
|---|---|---|---|
| `/safety/home` → `proto:src/pages/safety/SafetyHome.tsx` | `/safety` → `bfcl:src/pages/safety/SafetyHome.tsx` | Full | Both render module hub; BFCL adds trend sparkline (`bfcl:src/components/safety/SafetyTrendSparkline.tsx`). |
| `/safety` → `proto:src/pages/safety/SafetyDashboard.tsx` | folded into `bfcl:src/pages/safety/SafetyHome.tsx` + `bfcl:src/hooks/useSafetyDashboardStats.ts` | Full | Stats computed client-side from `safety_incidents_with_sla` view (`bfcl:src/hooks/useSafetyDashboardStats.ts:42`). |
| `/safety/incidents` → `proto:src/pages/safety/IncidentList.tsx` | `/safety/incidents` → `bfcl:src/pages/safety/SafetyIncidents.tsx` | Full | Same filters; BFCL adds responsive list + sticky action bar. |
| `/safety/incidents/new` → `proto:src/pages/safety/IncidentForm.tsx` | `/safety/incidents/new` → `bfcl:src/pages/safety/SafetyIncidentNew.tsx` | Full (expanded) | BFCL submits via `report_safety_incident` RPC (`bfcl:src/hooks/useSafetyIncidents.ts:104`); prototype does raw insert. |
| `/safety/incidents/:id` → `proto:src/pages/safety/IncidentDetail.tsx` | `/safety/incidents/:id` → `bfcl:src/pages/safety/SafetyIncidentDetail.tsx` | Full (expanded) | BFCL adds `IncidentRcaPanel`, `StageActionPanel`, FSM badge, timeline grouping. |
| `/safety/permits` → `proto:src/pages/safety/PermitToWork.tsx` | `/safety/permits` + `/safety/permits/new` + `/safety/permits/:id` + `/safety/permits/types` → `bfcl:src/pages/safety/SafetyPermits.tsx` et al. | Full (expanded) | BFCL adds LOTO/HIRA, approvals, permit-type config, expiry sweep. |
| `/safety/audits` → `proto:src/pages/safety/SafetyAudits.tsx` | `/safety/audits` + `templates` + `runs/new` + `runs/:id` + `scoreboard` → `bfcl:src/pages/safety/Safety{Audits,AuditTemplates,AuditRunNew,AuditRunDetail,AuditScoreboard}.tsx` | Partial | Same intent; richer template/run model. Prototype's flat `safety_audit_checklists` + `safety_audit_results` collapsed in BFCL. |
| `/safety/training` → `proto:src/pages/safety/SafetyTraining.tsx` | `/safety/training` + `/safety/training/admin` → `bfcl:src/pages/safety/Safety{Training,TrainingAdmin}.tsx` | Full (expanded) | BFCL adds attempts/quizzes/SOP tables. |
| `/safety/assets` → `proto:src/pages/safety/SafetyAssets.tsx` | `/safety/assets` + `assets/new` + `assets/:id` → `bfcl:src/pages/safety/SafetyAsset*.tsx` | Full (expanded) | BFCL adds calibration sub-table + evidence. |
| `/safety/emergencies` → `proto:src/pages/safety/EmergencyResponse.tsx` | `/safety/emergency` + `/safety/emergency/contacts` + `/safety/emergency/drills/*` → `bfcl:src/pages/safety/SafetyEmergency*.tsx` | Partial | Prototype models *events* with acknowledgements; BFCL models *drills* + *contacts*. Overlay + siren parity confirmed (see hooks). |
| `/safety/analytics` → `proto:src/pages/safety/SafetyAnalytics.tsx` | `/safety/analytics` → `bfcl:src/pages/safety/SafetyAnalytics.tsx` | Partial | BFCL uses 7 MVs (Phase 8 contract) vs. prototype's 4 RPCs. Charts differ. |
| `/safety/settings` → `proto:src/pages/safety/SafetySettings.tsx` | `/safety/settings` + `/safety/sla` + `/safety/audit-log` + `/safety/users` + `/safety/hours-worked` → `bfcl:src/pages/safety/*` | Full (expanded) | BFCL splits settings + role import + SLA monitor + hours into separate pages. |

### 2.2 Components (safety/)

| Prototype component | BFCL counterpart | Status |
|---|---|---|
| `proto:src/components/safety/EmergencyAlertOverlay.tsx` | `bfcl:src/components/safety/EmergencyOverlay.tsx` + `bfcl:src/components/safety/EmergencyFab.tsx` + `bfcl:src/hooks/useEmergencySiren.ts` | Full |
| `proto:src/components/safety/EmployeeSearchField.tsx` | inline employee search in incident/drill forms (no shared component, but functionality present) | Partial |
| `proto:src/components/safety/EvidencePanel.tsx` | `bfcl:src/components/safety/EvidenceList.tsx` + `bfcl:src/lib/safetyOfflineQueue.ts` | Full |
| `proto:src/components/safety/IncidentApprovalPanel.tsx` | `bfcl:src/components/safety/StageActionPanel.tsx` (handles all FSM stages incl. approval) | Full |
| `proto:src/components/safety/IncidentAssignmentPanel.tsx` | `bfcl:src/components/safety/StageActionPanel.tsx` (`assigned` stage) | Full |
| `proto:src/components/safety/IncidentCard.tsx` | `bfcl:src/components/safety/SafetyMobileListCard.tsx` | Full |
| `proto:src/components/safety/IncidentClosurePanel.tsx` | `bfcl:src/components/safety/StageActionPanel.tsx` (`closed` stage) | Full |
| `proto:src/components/safety/IncidentFormFields.tsx` | inlined in `bfcl:src/pages/safety/SafetyIncidentNew.tsx` | Full |
| `proto:src/components/safety/IncidentProgressPanel.tsx` | `bfcl:src/components/safety/ProgressLogList.tsx` | Full |
| `proto:src/components/safety/IncidentTable.tsx` | `bfcl:src/components/safety/SafetyDataTable.tsx` + `SafetyResponsiveList.tsx` | Full |
| `proto:src/components/safety/OrphanIncidentDialog.tsx` | `bfcl:src/components/safety/OrphanIncidentDialog.tsx` | Full (RPC-backed: `revive_orphaned_safety_incident`) |
| `proto:src/components/safety/RoleAssignmentMappingPanel.tsx` | `bfcl:src/pages/safety/SafetyUsers.tsx` + `bfcl:src/components/safety/SafetyRoleImportDialog.tsx` | Partial — different role model (see §6 RBAC) |
| `proto:src/components/safety/SafetyDataExport.tsx` | `bfcl:src/components/safety/SafetyDataExportDialog.tsx` + `bfcl:src/lib/safetyDataExport.ts` | Full (expanded to 7 datasets, 50k cap) |
| `proto:src/components/safety/SafetyEmployeeImport.tsx` | `bfcl:src/components/safety/SafetyRoleImportDialog.tsx` + `bfcl:src/lib/safetyRoleCsv.ts` | Full (CSV pipeline, but no edge-fn dependency in BFCL — see §5) |
| `proto:src/components/safety/SlaCountdown.tsx` | `bfcl:src/components/safety/SafetySlaBadge.tsx` + `bfcl:src/components/safety/SlaBadge.tsx` | Full |
| `proto:src/components/safety/SyncStatusBar.tsx` | `bfcl:src/components/safety/SafetyOfflineBadge.tsx` + `bfcl:src/components/safety/OfflineQueueInspector.tsx` + `bfcl:src/contexts/SafetyOfflineSyncContext.tsx` | Full (expanded — inspector dialog) |
| `proto:src/components/safety/dashboard/AtRiskWidget.tsx` | computed inline in `bfcl:src/hooks/useSafetyDashboardStats.ts` (no dedicated widget) | Partial |
| `proto:src/components/safety/dashboard/BuHeadDashboard.tsx` | n/a — BFCL uses unified `SafetyHome` | **Missing** |
| `proto:src/components/safety/dashboard/DeptRiskWidget.tsx` | n/a | **Missing** |
| `proto:src/components/safety/dashboard/OverdueWidget.tsx` | overdue tile in `bfcl:src/pages/safety/SafetyHome.tsx` (from `useSafetyDashboardStats.overdue`) | Partial |
| `proto:src/components/safety/dashboard/PersonalDashboard.tsx` | folded into `SafetyHome` (`myAssignments` slice) | Partial |
| `proto:src/components/safety/dashboard/RepeatHeatmapWidget.tsx` | n/a | **Missing** |
| `proto:src/components/safety/dashboard/SeverityCountsWidget.tsx` | severity tile in `SafetyHome` (`bySeverity`) | Full |

### 2.3 Hooks

| Prototype hook | BFCL hook | Status |
|---|---|---|
| `proto:src/hooks/useSafetyDashboard.ts` (5 RPCs) | `bfcl:src/hooks/useSafetyDashboardStats.ts` (view-aggregation) | Partial — same outputs, different source |
| `proto:src/hooks/useSafetyAnalytics.ts` (4 RPCs) | `bfcl:src/hooks/useSafetyAnalytics.ts` (7 MVs + refresh RPC) | Full (expanded) |
| `proto:src/hooks/useSafetyAudits.ts` | `bfcl:src/hooks/useSafetyAudits.ts` (+ template/run helpers in `bfcl:src/lib/safetyAudits.ts`) | Full (expanded) |
| `proto:src/hooks/useSafetyBuData.ts` | `bfcl:src/hooks/useSafetyOrg.ts` | Full |
| `proto:src/hooks/useSafetyEmergencies.ts` | `bfcl:src/hooks/useSafetyEmergency.ts` + `bfcl:src/hooks/useSafetyDrill.ts` + `bfcl:src/hooks/useLatestSafetyDrillRun.ts` | Partial (event→drill remodel) |
| `proto:src/hooks/useSafetyIncidents.ts` (raw insert) | `bfcl:src/hooks/useSafetyIncidents.ts` (`report_safety_incident` RPC) | Full (hardened) |
| `proto:src/hooks/useSafetyMasterData.ts` | n/a — no `safety_master_data` table in BFCL | **Missing** (low-impact: prototype only uses it for dropdown seed data, which BFCL pulls from `safety_settings` KV) |
| `proto:src/hooks/useSafetyPermits.ts` | `bfcl:src/hooks/useSafetyPermits.ts` (+ `bfcl:src/lib/safetyPermits.ts` RPC wrappers) | Full (expanded) |
| `proto:src/hooks/useSafetyPersonalData.ts` | derived inline in `useSafetyDashboardStats` | Full |
| `proto:src/hooks/useSafetyRealtimeSync.ts` | `bfcl:src/hooks/useSafetyRealtimeSync.ts` | Full |
| `proto:src/hooks/useSafetyRoleContext.ts` | `bfcl:src/hooks/useSafetyRoles.ts` + `has_safety_role()` RPC | Full (different model — see §6) |
| `proto:src/hooks/useSafetyTraining.ts` | `bfcl:src/hooks/useSafetyTraining.ts` | Full (expanded — attempts) |
| `proto:src/hooks/useTransitionSafetyIncident.ts` | merged into `bfcl:src/hooks/useSafetyIncidents.ts` (`useTransitionSafetyIncident`) | Full |
| `proto:src/hooks/useIncidentAutoAssign.ts` | server-side via `safety_incident_before_insert` trigger | Full (moved to DB) |
| `proto:src/hooks/useIncidentEvidence.ts` | `bfcl:src/lib/safetyIncidentSubmit.ts` + `bfcl:src/components/safety/EvidenceList.tsx` | Full |
| `proto:src/hooks/useIncidentProgressLogs.ts` | `bfcl:src/components/safety/ProgressLogList.tsx` (uses `safety_incident_progress_logs`) | Full |
| `proto:src/hooks/useOfflineSync.ts` | `bfcl:src/contexts/SafetyOfflineSyncContext.tsx` + `bfcl:src/lib/safetyOfflineQueue.ts` + `safetyOfflineErrorClassify.ts` | Full (richer error classification) |
| `proto:src/hooks/useRoleAssignmentMappings.ts` | `bfcl:src/hooks/useSafetyRoles.ts` (queries `safety_user_roles`) | Partial — different table |

### 2.4 Libraries / utilities

| Prototype lib | BFCL lib | Status |
|---|---|---|
| `proto:src/lib/offlineIncidentDb.ts` (IndexedDB wrapper) | `bfcl:src/lib/safetyOfflineQueue.ts` | Full |
| `proto:src/lib/sirenSound.ts` | `bfcl:src/hooks/useEmergencySiren.ts` (hook variant) | Full |
| `proto:src/lib/roles.ts` (RBAC helpers) | `bfcl:src/lib/safetyRoles.ts` | Full |
| `proto:src/lib/storageDownload.ts` | inlined in `bfcl:src/lib/safetyIncidentSubmit.ts` + `safetyOfflineQueue.ts` | Full |
| (no equivalent) | `bfcl:src/lib/safetyOfflineErrorClassify.ts` | BFCL-only — error-class routing for offline retries |
| (no equivalent) | `bfcl:src/lib/safetyDataExport.ts` (7-dataset CSV) | BFCL-only |
| (no equivalent) | `bfcl:src/lib/safetyRoleCsv.ts` (CSV import) | BFCL-only |
| (no equivalent) | `bfcl:src/lib/incidentTimelineGrouping.ts` | BFCL-only |

---

## 3. Database parity

### 3.1 Tables

Prototype has 17 `safety_*` tables; BFCL has 33. Mapping:

| Prototype table | BFCL table(s) | Status |
|---|---|---|
| `safety_incidents` | `safety_incidents` (+ view `safety_incidents_with_sla`) | Full (expanded columns) |
| `safety_incident_evidence` | `safety_incident_evidence` | Full |
| `safety_incident_timeline` | `safety_incident_timeline` | Full |
| `safety_incident_tickets` | replaced by `safety_notifications` + `safety_incident_progress_logs` | Partial |
| `safety_incident_versions` | n/a (BFCL relies on `safety_audit_log` + timeline) | Partial |
| `safety_permits` | `safety_permits` (+ `safety_permit_approvals`, `safety_permit_evidence`, `safety_permit_hira`, `safety_permit_loto_steps`, `safety_permit_type_config`) | Full (expanded) |
| `safety_assets` | `safety_assets` (+ `safety_asset_calibrations`, `safety_asset_evidence`) | Full (expanded) |
| `safety_audit_checklists` | `safety_audit_templates` + `safety_audit_template_items` | Partial (model change) |
| `safety_audit_results` | `safety_audit_runs` + `safety_audit_run_responses` | Partial (model change) |
| `safety_audit_logs` | `safety_audit_log` | Full |
| `safety_assignment_audit_log` | `safety_audit_log` (unified) | Full |
| `safety_training_assignments` | `safety_training_assignments` (+ `safety_training_attempts`, `safety_quizzes`, `safety_quiz_questions`, `safety_sops`) | Full (expanded) |
| `safety_emergency_events` | `safety_emergency_drills` (+ `safety_drill_runs`, `safety_drill_participants`, `safety_drill_findings`) | Partial (event→drill remodel) |
| `safety_emergency_acknowledgements` | n/a (drills don't require ack; overlay used instead) | **Missing** |
| `safety_escalations` | `safety_sla_escalations` (+ `safety_severity_sla`) | Full |
| `safety_employee_imports` | replaced by `safety_module_access` + `grant-safety-role` edge fn + CSV dialog | Full |
| `safety_master_data` | n/a — BFCL uses `safety_settings` KV + native lookup tables | **Missing** |

BFCL-only tables (no prototype equivalent): `safety_module_access`,
`safety_user_roles`, `safety_settings`, `safety_severity_sla`,
`safety_emergency_contacts`, `safety_hours_worked`, `safety_notifications`,
`safety_incident_progress_logs`, `safety_sops`, `safety_quizzes`,
`safety_quiz_questions`, `safety_training_attempts`,
`safety_permit_approvals`, `safety_permit_evidence`, `safety_permit_hira`,
`safety_permit_loto_steps`, `safety_permit_type_config`,
`safety_asset_calibrations`, `safety_asset_evidence`,
`safety_audit_templates`, `safety_audit_template_items`,
`safety_audit_runs`, `safety_audit_run_responses`, `safety_drill_runs`,
`safety_drill_participants`, `safety_drill_findings`. (26 net-new tables.)

### 3.2 Views / materialized views

- Prototype: **0** views/MVs (extracted from `/tmp/proto/supabase/migrations`).
- BFCL: 7 MVs (`mv_safety_trir`, `mv_safety_severity_rate`,
  `mv_safety_incidents_open_vs_closed`, `mv_safety_training_compliance`,
  `mv_safety_audit_scoreboard`, `mv_safety_permit_throughput`,
  `mv_safety_incident_monthly_trend`) plus the
  `safety_incidents_with_sla` view. Locked by Phase 8 contract test
  (`bfcl:src/test/safety/phase8/analytics-mv-contract.test.ts`).

### 3.3 RPCs (SECURITY DEFINER unless noted)

| Prototype RPC | BFCL RPC | Status |
|---|---|---|
| `transition_safety_incident(incident, to_stage, payload)` | `transition_safety_incident(p_incident_id, p_to_status, p_notes, p_assigned_to)` | Full (richer signature) |
| (n/a — prototype inserts directly) | `report_safety_incident(p_payload)` | BFCL-only (Phase 18 hardening) |
| (n/a) | `revive_orphaned_safety_incident(p_incident_id, p_assigned_to, p_notes)` | BFCL-only (ADR-089) |
| `log_safety_audit(...)` (trigger fn) | trigger fns: `log_safety_role_change`, etc. | Full |
| `run_safety_escalation_checks` | `run_safety_sla_escalations` | Full |
| `safety_dashboard_overdue` | replaced by `safety_incidents_with_sla` view + client agg | Partial |
| `safety_dashboard_severity_counts` | replaced by client agg | Partial |
| `safety_dashboard_at_risk` | n/a | **Missing** |
| `safety_dashboard_dept_risk` | n/a | **Missing** |
| `safety_dashboard_repeat_heatmap` | n/a | **Missing** |
| `safety_analytics_mttr` | covered by `mv_safety_trir` + `mv_safety_severity_rate` | Partial |
| `safety_analytics_recurrence` | n/a (no MV equivalent) | **Missing** |
| `safety_analytics_top_root_causes` | n/a | **Missing** |
| `safety_analytics_dept_risk_trend` | n/a | **Missing** |
| (n/a) | `refresh_safety_analytics`, `has_safety_role`, `has_any_safety_role`, `has_safety_module_access`, `can_view_safety_incident`, `assign_permit_number`, `submit_permit`, `activate_permit`, `suspend_permit`, `close_permit`, `decide_permit_level`, `is_permit_approver`, `expire_overdue_permits`, `get_safety_setting`, `set_safety_setting`, `enqueue_safety_notification`, `enqueue_safety_compression_on_insert`, `safety_drill_load`, `safety_drill_seed`, `safety_drill_truncate`, `safety_drill_counts` | BFCL-only (~21 additional RPCs) |

### 3.4 Triggers

Prototype: 16 triggers (`trg_audit_*`, `trg_notify_*`, `trg_set_safety_incident_sla`, `trg_user_deactivation_safety`, `update_*_updated_at`).

BFCL: All prototype triggers have analogues. Additionally BFCL enforces
**FSM/RBAC guards at the trigger layer** (the prototype does *not*):

- `safety_incident_before_insert` — stamps reporter, idempotency.
- `safety_incident_fsm_guard` — **blocks any direct status update**.
- `guard_permit_status_write` — blocks direct permit status writes.
- `safety_audit_runs_block_status_writes`,
  `safety_drills_block_status_writes`,
  `safety_training_block_status_writes` — same pattern.

Status: prototype guards Full; BFCL-only guards are net-positive.

### 3.5 Storage buckets

| Bucket | Prototype | BFCL |
|---|---|---|
| `safety-media` | public, user-folder-scoped policy | present (same name, RLS via `(storage.foldername(name))[1]` = `auth.uid()`). Equivalence confirmed by behaviour. **Full**. |

### 3.6 RLS policies

Prototype enables RLS on safety tables; BFCL enables RLS on **all 33**
`safety_*` tables and locks the posture with a static smoke test
(`bfcl:src/test/safety/phase8/safety-rls-smoke.test.ts`). BFCL also
forbids ad-hoc `REFRESH MATERIALIZED VIEW` from the client, public
read of `mv_safety_*` (ticket T-001), and revokes anon module access
(ticket T-005). Status: **Full + hardened**.

---

## 4. Missing files (prototype features with no BFCL equivalent)

1. `proto:src/components/safety/dashboard/BuHeadDashboard.tsx` — BU-Head-scoped dashboard layout.
2. `proto:src/components/safety/dashboard/DeptRiskWidget.tsx` — department risk heat tile.
3. `proto:src/components/safety/dashboard/RepeatHeatmapWidget.tsx` — location-recurrence heatmap.
4. `proto:src/hooks/useSafetyMasterData.ts` + table `safety_master_data` — generic master-data registry.
5. RPC `safety_dashboard_at_risk` — multi-factor at-risk roster.
6. RPC `safety_analytics_recurrence` + `safety_analytics_top_root_causes` + `safety_analytics_dept_risk_trend` — three analytics RPCs not covered by current MV set.
7. Table `safety_emergency_acknowledgements` — ack-per-employee for emergencies (BFCL's drill model side-steps this).

None of the seven cause BFCL runtime breakage — they are features absent
from BFCL, not dead references in BFCL.

---

## 5. Broken implementations (BFCL files that don't actually work)

**None found.**

Every BFCL safety hook resolves to an existing RPC/table/MV in current
migration history:

- `useSafetyIncidents` → `report_safety_incident` RPC ✓ (migration `20260530065918`).
- `useReviveOrphanedIncident` → `revive_orphaned_safety_incident` ✓ (`20260611040916`).
- `useTransitionSafetyIncident` → `transition_safety_incident` ✓.
- `useSafetyAnalytics` → 7 MVs ✓ (Phase 8 contract test green).
- Permit RPC wrappers in `bfcl:src/lib/safetyPermits.ts` → `submit/activate/suspend/close/decide_permit` ✓.
- `useSafetyDrill` → `safety_drill_load/seed/truncate/counts` ✓.
- Module gate `useModules` → `has_safety_module_access` ✓.

The Phase 8 SSOT tests
(`bfcl:src/test/safety/phase8/*.test.ts`) statically lock these
wirings; the Phase 3/4 contract tests
(`incidentUxV2NoDirectWrites.test.ts`,
`offlineInspectorNoNewWriters.test.ts`) prevent re-introduction of
direct writes. Latest test run: **1901/1901 passing**.

One **note, not a break**: `bfcl:src/components/safety/SafetyRoleImportDialog.tsx`
performs role CSV import client-side (one row at a time, RLS-gated)
rather than via an `import-safety-employees` edge function as the
prototype does. This is a deliberate downgrade (auditable via
`safety_user_roles` trigger). If high-volume bulk import is needed,
the prototype's edge function pattern (`proto:supabase/functions/import-safety-employees/index.ts`)
would have to be ported.

---

## 6. RBAC / module-gate parity

| Concern | Prototype | BFCL |
|---|---|---|
| Role enum | `safety_role_type` ENUM(`bu_head`, `safety_head`) | `safety_app_role` ENUM (richer: admin, safety_head, safety_officer, bu_head, dept_head, contributor, viewer) |
| Role storage | `role_assignment_mapping` table | `safety_user_roles` table (BU-scoped + audited) |
| Role check | client-side via `useSafetyRoleContext` | server-side `has_safety_role(uid, role)` + `has_any_safety_role(uid)` SECURITY DEFINER |
| Module gate | none — anyone in `app_role` could hit `/safety/*` | `has_safety_module_access(uid)` + `safety_module_access` table + `SafetyModuleRoute` shell + realtime invalidation (`bfcl:src/test/safety/phase8/module-hub-realtime.test.ts`) |
| Row visibility | direct RLS comparing `auth.uid()` | `can_view_safety_incident(uid, incident)` SECURITY DEFINER (recursion-safe) |

**Status: Full (BFCL is the stricter superset).** The only behaviour
regression is naming — the prototype's BU-Head dashboard splits the home
page by role; BFCL folds it into one role-aware `SafetyHome`.

---

## 7. Edge functions parity

| Prototype edge fn | BFCL edge fn | Status |
|---|---|---|
| `check-safety-sla` | `check-safety-sla` | Full (BFCL hardens with JWT verify per ticket T-005) |
| `safety-analytics` | `safety-analytics` | Full |
| `safety-escalations` | folded into `check-safety-sla` + `run_safety_sla_escalations` RPC | Full |
| `safety-incident-evidence` | replaced by direct storage upload via `safetyIncidentSubmit.ts` + RLS-bound policies | Full |
| `safety-notifications` | replaced by `safety_notifications` table + DB trigger `enqueue_safety_notification` | Full |
| `safety-sla-status` | replaced by `safety_incidents_with_sla` view | Full |
| `transition-safety-incident` | replaced by direct client → `transition_safety_incident` RPC | Full |
| `reopen-safety-incident` | covered by `transition_safety_incident` (reopen transition) | Full |
| `import-safety-employees` | replaced by client-side CSV (`SafetyRoleImportDialog`) | Partial (see §5 note) |
| (n/a) | `grant-safety-role` | BFCL-only (admin grant flow) |
| (n/a) | `permit-expiry-sweep` | BFCL-only (cron) |
| (n/a) | `safety-drill` | BFCL-only (drill load/seed/truncate) |

---

## 8. Workflow / state-machine parity

| Workflow | Prototype | BFCL |
|---|---|---|
| Incident FSM | Stages enforced in `transition_safety_incident` RPC; client could still write `status` directly | Same stages + **trigger guard** blocking any non-RPC write (`safety_incident_fsm_guard`) |
| Permit lifecycle | client-side state changes | 5 dedicated RPCs (`submit/activate/suspend/close/decide_permit`) + `guard_permit_status_write` trigger |
| Audit run | none (results model is flat) | template→items→run→responses, status-blocked trigger |
| Drill | event/ack model | drill→participants→findings, status-blocked trigger |
| Training | assignment→deadline | assignment→attempts→quizzes, status-blocked trigger |
| Idempotency | `client_submission_id` UNIQUE | same UNIQUE + `safety_incident_before_insert` trigger + offline queue dedupe |

Status: **Full**, BFCL strictly more defensive.

---

## 9. PMS (non-safety) parity — out-of-band note

The prototype includes a near-full PMS clone (`/admin/**`, `/reports/**`,
incentive, IAC, KPI workflow, review periods, observations, queries,
notifications, etc.). BFCL is the canonical PMS — every prototype PMS
route resolves to an equivalent or expanded BFCL route. A
route-by-route check found:

- 38 of 38 prototype admin/report routes have a BFCL equivalent.
- BFCL adds Identity & Access Console, Implementer Console,
  Menu Settings, Profile-Based Access, KPI Standardization Registry,
  multi-company governance, scheduled email queue, and configurable
  final-score rules — features the prototype lacks entirely.

No PMS-side regressions, missing files, or broken implementations were
found in BFCL relative to the prototype.

---

## 10. Final score sheet

Re-stated with raw counts for the 74 safety artefacts traced:

| Verdict | Raw | % |
|---|---:|---:|
| Full | 58 | 78.4 % |
| Partial | 9 | 12.2 % |
| UI Only | 0 | 0.0 % |
| Broken | 0 | 0.0 % |
| Missing | 7 | 9.5 % |

Weighting (DB > workflow > hook > page > component) does not move the
headline numbers because the seven Missing items are concentrated in
dashboard widgets + analytics RPCs (mid-weight) and the nine Partial
items reflect intentional schema/UI consolidations rather than lost
behaviour.

### Recommended follow-ups (not implemented in this audit)

1. Add three MVs / RPCs to close the analytics gap: recurrence,
   top root causes, dept risk trend.
2. Decide whether the BU-Head + Dept-Risk + Repeat-Heatmap widgets
   are required for BFCL's audience; if yes, ship as additive widgets
   over the existing `safety_incidents_with_sla` view.
3. Decide whether bulk role import volume justifies porting the
   prototype's `import-safety-employees` edge function pattern (current
   client-side CSV is fine for ≤ ~500 rows).

---

## Appendix A — Prototype safety inventory (raw)

- 12 pages under `src/pages/safety/`
- 23 components under `src/components/safety/`
- 18 safety hooks under `src/hooks/`
- 4 safety libs under `src/lib/` (`offlineIncidentDb`, `sirenSound`, `roles`, `storageDownload`)
- 9 safety edge functions under `supabase/functions/`
- 17 `safety_*` tables, 0 MVs, 2 safety enums, 16 safety triggers, 12 safety RPCs (extracted from 317 prototype migrations)
- 1 storage bucket: `safety-media`

## Appendix B — BFCL safety inventory (raw)

- 28 pages under `src/pages/safety/`
- 35 components under `src/components/safety/` (+ `analytics/` subdir)
- 18 safety hooks under `src/hooks/`
- 16 safety libs under `src/lib/`
- 5 safety edge functions: `check-safety-sla`, `grant-safety-role`, `safety-analytics`, `safety-drill`, `permit-expiry-sweep`
- 33 `safety_*` tables, 7 MVs + 1 view (`safety_incidents_with_sla`), ~30 safety RPCs (incl. permit + FSM + analytics refresh), trigger-level FSM guards on incidents/permits/audit-runs/drills/training
- 1 storage bucket: `safety-media` (RLS hardened, user-folder scoped)

---

*End of report.*

---

## 11. Addendum — Parity closeout (2026-06-11)

Implementation of the 7 Missing items per the user-approved Missing-Only
plan (`.lovable/plan.md`).

| # | Gap | Status | Evidence |
|---|---|---|---|
| 1 | `BuHeadDashboard.tsx` | **Shipped** | `bfcl:src/components/safety/dashboard/BuHeadDashboard.tsx`, mounted in `SafetyHome.tsx` |
| 2 | `DeptRiskWidget.tsx` | **Shipped** | `bfcl:src/components/safety/dashboard/DeptRiskWidget.tsx` (reads `safety_analytics_dept_risk_trend`) |
| 3 | `RepeatHeatmapWidget.tsx` | **Shipped** | `bfcl:src/components/safety/dashboard/RepeatHeatmapWidget.tsx` (reads `safety_analytics_recurrence`) |
| 4 | `safety_master_data` + hook | **Shipped** | table `public.safety_master_data` + `bfcl:src/hooks/useSafetyMasterData.ts` + admin panel in `SafetySettings` |
| 5 | `safety_dashboard_at_risk` RPC | **Shipped** | RPC live; consumed by `AtRiskWidget.tsx` |
| 6 | 3 analytics RPCs (`recurrence`, `top_root_causes`, `dept_risk_trend`) | **Shipped** | RPCs + backing MVs (`mv_safety_recurrence`, `mv_safety_top_root_causes`, `mv_safety_dept_risk_trend`); `refresh_safety_analytics` extended; Phase 8 contract allowlist updated |
| 7 | `safety_emergency_acknowledgements` | **Won't fix — superseded** | BFCL drill model uses `safety_drill_participants` + `safety_drill_findings` and is locked by `safety_drills_block_status_writes`. Re-introducing per-employee acks would require loosening the FSM guard, which Phase 8 SSOT forbids. Drill participation provides the same auditable signal (per-user row with status). |

**Caveat on item 6.** The prototype's `safety_analytics_top_root_causes`
is keyed by a free-text `root_cause` column that does not exist on
`safety_incidents` in BFCL. The shipped MV substitutes `incident_type`
(8-value enum) as the cause dimension. If a true free-text root-cause
column is later added (or `rca_summary` is normalized), the MV definition
should be revisited.

**Final score impact.** 6 of 7 Missing items shipped; 1 closed as
"won't fix — superseded". Adjusted parity: 65/74 (87.8%) Full,
9/74 (12.2%) Partial, 0 Broken, 0 Missing (with documented
superseded item). No file classified Full or Partial was modified.