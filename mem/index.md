# Project Memory

## Core
Always sync DOCUMENTATION.md + POLICY.md in the same step as code changes; append to Version History.
Every bug fix needs a regression test in src/test/bugBountyFixes.test.ts.
Use semantic design tokens (HSL) — never raw colors in components, except inside isolated brand SVG art.
Centered PageLoadingOverlay is for page navigation + initial data loads only; refresh actions use inline button feedback (POLICY.md §103).
Per-KPI status-transition aggregations MUST read from `public.kpi_audit_logs` (join via `kpi_id`) — never `audit_logs` (does not exist) — using canonical status literals: self_review / manager_check / skip_level_check / hr_pms_review / audit / management_review / kra_set / approved.
Per-employee workflow chains in reports MUST resolve via `get_bulk_employee_workflows` / `get_employee_workflow` — never hardcode the stage array (POLICY.md §105).
`kpis.status` must NEVER be written as NULL — guard reviewer mutations and render "Status Missing" for null in display badges (POLICY.md §106 / BUG-035).
No reviewer panel (Team/Audit/HR PMS/Management/Skip-Level/Pending-*/cross-check) may surface the viewer's own profile — Self tab is the only self-assessment surface (POLICY.md §107 / BUG-036).
Notification triggers must guard non-login recipients (no auth.users row) — pre-check + EXCEPTION wrapper, never abort business txn (POLICY.md §108 / BUG-037).
Safety lists: no auto-fetch — Search button triggers query; every table paginates server-side via `useManualQuery` + `<SafetyFilterBar>` + `<SafetyDataTable>` (POLICY §113 / ADR-050).
Agent safety: zero destructive autonomy, stop-and-ask on errors, propose-don't-act, least-privilege. See safety-directives.
Engineering: SSOT+POLICY.md sync, RCA with regression test, lean UI / logic in hooks, RLS-first, pre-impl Risk & Impact Report. See engineering-standards.
Lean-Load: debounce search inputs (>200 rows / network); paginate new lists with `.range()`; `useAllKpis` slim projection; full-org reads only via sanctioned `fetchAllPaged` sites. See lean-load-policy (POLICY §120).
- [System Settings Ownership Inventory](mem://infrastructure/system-settings-ownership-inventory) — Complete audit of settings surfaces, tables, keys, role ownership, RBAC enforcement, gaps
- [Safety Perf CAPA Wave 1](mem://infrastructure/safety-perf-capa-wave-1) — Forbids unbounded incidents reads; SafetyHome SLA queue + KPI drill-down + incidents accident-join scoped to server-side predicates (v2.66.19)

## Memories
- [Annual Review System](mem://features/annual-review/overview) — Phase 1 module: 5 tables, snapshot reviewer chain, advance RPC, multilingual + XLSX, feature-flag gated
- [Annual Review Per-Employee Template Override](mem://features/annual-review/per-employee-template-override) — template_override_id, resolveTemplateId SSOT, override-safe seeder, set RPC
- [Page loading overlay pattern](mem://design/page-loading-overlay-pattern) — Centered PageLoadingOverlay wired in DashboardLayout (Suspense + RouteDataLoadingGate), rocket+chart art
- [Access-Profile / RLS alignment](mem://architecture/security/access-profile-rls-alignment) — has_menu_right SSOT + assertRowsTouched guard; v1 delegates admin-users update and admin-access-profiles add/delete only
- [Increment Engine PMS Score Source](mem://features/incentive/pms-score-source) — compute-increment derives monthly PMS score live from review_submissions + kpis (8-stage chain, weighted avg); performance_reviews is NOT a source
- [All KRAs Period Read Contract](mem://features/admin/all-kras-period-read-contract) — Month KPI reads via get_reviewer_kpis_for_period RPC; chunk profile hydration ≤500 IDs
- [Lean-Load Policy](mem://architecture/performance/lean-load-policy) — Debounced inputs, slim KPI projection, paginated lists; rejects blanket select('*') rewrite & 20-row picker caps (POLICY §120)
- [Bulk Review Dashboard](mem://features/review/bulk-review-dashboard) — PRD v2.0, flag-gated /review/bulk-scoring with parallel stages + audited re-open (M1+M2 shipped)
- [Notification recipient guard](mem://architecture/database/notification-recipient-guard) — Non-login user FK guard for notification trigger inserts (BUG-037 / POLICY §108)
- [KPI audit logs canonical](mem://architecture/database/kpi-audit-logs-canonical) — Canonical table & status vocabulary for workflow-transition aggregations (BUG-031)
- [Per-employee workflow resolution](mem://architecture/database/per-employee-workflow-resolution) — Use canonical resolver in reports; never hardcode stage arrays (BUG-033)
- [No-NULL kpi.status invariant](mem://architecture/database/no-null-kpi-status) — Guard reviewer writes + Status Missing UI badge (BUG-035 / POLICY §106)
- [Reviewer self-exclusion](mem://features/review/reviewer-self-exclusion) — Strip viewer from every reviewer grid + DB trigger blocking self-reporting (BUG-036 / POLICY §107)
- [Large-table export pagination](mem://architecture/database/large-export-pagination-policy) — Ordered fetchAllPaged + .in() lookup decoupling for exports >1k rows (BUG-038 / POLICY §109)
- [Profile cache invalidation](mem://architecture/profile-cache-invalidation) — invalidateProfileCaches helper + useProfilesVersion realtime counter for hooks caching profile-derived data (POLICY §95)
- [Safety module shell isolation](mem://architecture/safety/module-shell-isolation) — /safety/* uses a fully decoupled SafetyLayout/SafetySidebar/SafetyHeader; PMS chrome forbidden in either direction; visibility gated by modules.is_enabled + safety_module_access (POLICY §110)
- [Safety RBAC](mem://architecture/safety/rbac) — safety_app_role enum + safety_user_roles table + has_safety_role() SECURITY DEFINER; granting any role implicitly grants Hub access; admin-managed via /safety/settings/users
- [Safety Incident FSM](mem://architecture/safety/incident-fsm) — 7-stage server-enforced workflow; transition_safety_incident RPC is the only legal entry point; SLA via safety_incidents_with_sla view; client_submission_id for offline dedup; ['safety',...] cache prefix isolation (POLICY §112)
- [Safety SLA & Notifications Engine](mem://features/safety/sla-and-notifications) — Phase 1.D in-app bell, idempotent escalation engine, pg_cron 5-min schedule, realtime invalidation
- [Safety Offline Incident Queue](mem://features/safety/offline-queue) — Phase 1.E IndexedDB queue, idempotent submitSafetyIncident, auto-flush on reconnect, header offline badge
- [Safety Audit & Dashboard](mem://features/safety/audit-and-dashboard) — Phase 1.F audit log surface and HSE KPI dashboard
- [Safety Realtime Sync](mem://features/safety/realtime-sync) — Phase 1.G module-scoped realtime invalidator mounted by SafetyLayout; never touches PMS caches
- [Safety Test Gate](mem://features/safety/test-gate) — Phase 1.H pure-logic suite locking FSM, SLA classifier, shell isolation, offline queue (21/21 passing)
- [Safety Manual-Fetch & Pagination](mem://architecture/safety/manual-fetch-and-pagination) — Filters-first, click-to-load, paginated tables; sanctioned primitives (POLICY §113 / ADR-050)
- [Image Compression Policy](mem://features/image-compression-policy) — Phase A client-side compression for Safety + PMS evidence; system_settings flags, skip rules, severity overrides
- [Server-side Image Compression (Phase B)](mem://features/image-compression-server) — WebP re-encoder edge function, queue table, pg_cron, PMS rewrite safety flag
- [Safety Roadmap Phases 2-7](mem://features/safety/roadmap-phase2-7) — Pointer to docs/safety-roadmap-phase2-7.md with Status Tracker for PTW, Training, Assets, Audits, Emergency, Analytics
- [Safety Permit-to-Work](mem://features/safety/permits-to-work) — Phase 2 PTW lifecycle, RPC-only transitions, configurable per-type approval ladders, HIRA/LOTO requirements, /safety/permits routes
- [Safety Training & SOPs (Phase 3)](mem://features/safety/training-and-sops) — RPC-only training lifecycle, server-scored quizzes, scroll-locked reader, daily overdue sweep
- [Safety Assets & Calibration (Phase 4)](mem://features/safety/assets-and-calibration) — Asset register, record_calibration RPC + history, T-7/T-1/overdue daily sweep, PTW expiry block (23/23 tests)
- [Safety Audit Checklists (Phase 5)](mem://features/safety/audit-checklists) — Templated audits with weighted scoring, critical-fail auto-incidents, RPC-only lifecycle, BU scoreboard (11/11 tests)
- [Safety Emergency Response (Phase 6)](mem://features/safety/emergency-response) — Drill lifecycle (RPC-only), mustering, findings, emergency contact directory (16/16 tests)
- [Safety Analytics (Phase 7)](mem://features/safety/analytics) — TRIR materialized views, hours-worked entry, refresh RPC + 30-min cron, dashboard with CSV export (16/16 tests)
- [Safety Analytics v2 (Phase 10)](mem://features/safety/analytics-v2) — Flag-gated monthly trend chart, BU risk heatmap, KPI tile drill-downs; new mv_safety_incident_monthly_trend
- [Safety Settings Hub (Phase X)](mem://features/safety/settings-hub) — safety_settings key/value table, get/set RPCs, admin-only writes, JSON editor at /safety/settings, six seeded business-variable keys (8/8 tests)
- [Multi-month KPI Cycle UX](mem://features/admin/multi-month-kpi-cycle-ux) — Banner contract for showing full cycle months + anchor month in admin KPI dialogs
- [Monthly Scorecard Trend](mem://features/reports/monthly-scorecard-trend) — Cache-bust + 200-ID submission batch ceiling for the Date-Range trend
- [Safety Mobile UX](mem://design/safety-mobile-ux) — Mobile primitives, sticky CTA, camera capture, FilterSheet for Safety entry-level users
- [Identity & Access Console (IAC)](mem://architecture/security/identity-access-console) — Hub-level capability-based RBAC at /admin/iac, replacing per-module role enums
- [HR Review Action Notes](mem://features/hr/review-action-notes) — HR notes for KPI changes during PMS review with admin-configurable per-role visibility and 3-state status FSM
- [Loader Branding Settings](mem://features/admin/loader-branding-settings) — Configurable rocket-overlay company name, tagline, and logo via system_settings; admin panel with live preview on Module Hub Settings
- [Safety Directives](mem://preferences/safety-directives) — Mandatory cautious-mode rules for destructive ops, errors, and privilege use
- [Engineering Standards](mem://preferences/engineering-standards) — SSOT/Policy sync, RCA, separation of concerns, RLS-first, pre-impl Risk Report
- [Changelog Protocol](mem://preferences/changelog-protocol) — Append shipped changes to CHANGELOG_2026.md current-week row in same step as DOCUMENTATION.md Version History

- [Auth-Readiness Query Gate](mem://architecture/auth-readiness-query-gate) — Gate RLS-dependent hooks on isReady to prevent empty-cache cold-load race

- [Org KPI Key Normalization](mem://features/admin/org-kpi-key-normalization) — Canonical owner/KPI key helper + tiered propagation overwrite policy
- [Org KPI Data Entry Empty State](mem://features/admin/org-kpi-data-entry-empty-state) — Loading guard, deriveOrgKpiEmptyState classifier, stale-filter self-heal, admin diagnostics (POLICY §98)
- [Org KPI Data Entry Snapshot RPC](mem://features/admin/org-kpi-data-entry-snapshot) — Org KPI page reads via get_org_kpi_data_entry_snapshot RPC (SECURITY DEFINER, in-function access); never paged raw kpis fetch
- [Dashboard KRA Add/Delete](mem://features/admin/dashboard-kra-management) — Allowlist-gated Add/Delete KRA on Dashboard reusing AdminKpiCreateDialog + useAdminDeleteKpi
- [Org KPI Propagation Truth](mem://features/admin/org-kpi-propagation-truth) — Row "Propagated" badge = review_submissions presence, not OKV.status; RPC mapper handles both result shapes
- [Team Reviews Zero-KPI RCA](mem://features/review/team-reviews-zero-kpi-rca) — KRA-issuance flows must invalidate ['kpis-by-period-ranges']; KRA Issuance has Managers Without KRAs panel; reviewer scope ignores department
- [HR PMS Reviewed Tile Semantics](mem://features/review/hr-pms-reviewed-tile-semantics) — Three-rule classification: signature, N/A, structural advancement
- [Weekly Review Windows Config](mem://features/admin/weekly-review-windows-config) — Admin-configurable Weekly KPI submission windows in frequency_config.review_window_rules; widened defaults eliminate dead-zone gaps (Jyoti RCA May 2026)
- [Org KPI Evidence Targeting](mem://features/admin/org-kpi-evidence-targeting) — Per-file employee/department targeting + Distribution Preview matrix
- [Category Weightage Badge](mem://features/review/category-weightage-badge) — Performance-by-Category badge sums all mapped KPI weightages regardless of is_na/frequency
- [Group-Based KPI Scoring (PRD v1.1)](mem://features/review/group-based-scoring) — Full-page Bulk Scoring Dashboard; click-gated load, 25k-cell cap, bulk_scope_preview + bulk_scoring_snapshot RPCs, virtualization, per-cell override, batch audit
- [Scheduled Backup Batch Size](mem://infrastructure/database/scheduled-backup-batch-size) — Manual + scheduled create-backup MUST share BATCH_SIZE=4 (256 MB worker cap); shrink → completed_with_errors + amber UI pill
- [Safety Incident UX v2 (Phase 3)](mem://features/safety/incident-ux-v2) — Flag-gated v2 incident detail (stage header, day-grouped timeline, RCA panel). UI-only; transition_safety_incident RPC contract preserved; rollback = flip `safety_settings.ui_incident_v2` to false.
- [Safety Offline Queue Inspector (Phase 4)](mem://features/safety/offline-inspector-v1) — Flag-gated Sheet exposing the IndexedDB queue with Retry-all + per-item Discard. UI-only; queue/idempotency/upload contracts preserved; rollback = flip `safety_settings.ui_offline_inspector_v1` to false.
- [Safety Emergency Overlay (Phase 5)](mem://features/safety/emergency-overlay-v1) — Flag-gated FAB + bottom/side Sheet with `tel:` contacts and "Report incident now" CTA on `/safety/*`. UI-only; zero writers/RPCs/uploads/fetch; rollback = flip `safety_settings.ui_emergency_overlay_v1` to false.
- [Safety SLA Monitor v2](mem://features/safety/sla-v2) — Phase 11 flag-gated at-risk queue card + countdown badge derived from cached incidents
- [Safety Incident Open INSERT Policy](mem://features/safety/incident-report-open-insert) — Phase 16 RLS: any authenticated user can file an incident; reporter_id = auth.uid() pin preserved; downstream SELECT/UPDATE/DELETE gates unchanged
- [Incident Submission RPC](mem://features/safety/incident-submission-rpc) — Phase 18 SECURITY DEFINER entrypoint; server-stamps reporter_id; idempotent on (reporter_id, client_submission_id); browser must NOT direct-insert
- [Increment Eligibility Exclusions](mem://features/admin/increment-eligibility-exclusions) — Per-AY employee exemptions from Increment Eligibility Criteria (never cross-year)
- [Increment criterion_key canonical binding](mem://features/incentive/criterion-key-canonical-binding) — Criterion keys MUST resolve to canonical metric keys; engine fails closed on unknown keys (ADR-070, Vivek 101784 RCA)
- [Auditor Draft Qualitative Hydration](mem://features/review/auditor-draft-qualitative-hydration) — Save/reopen contract for Yes/No / tiered audit drafts; never inherit employee value
- [Audit Review Journey Staleness Guard](mem://features/review/audit-review-journey-staleness) — Fallback chain + loading-vs-empty contract for Audit Review Self/Manager tiles
- [Functional Manager Reviewer](mem://features/admin/functional-manager-reviewer) — Per-employee FM relationship + functional_manager_check stage + is_functional_manager_of() RLS helper
- [Report Field Sequence](mem://features/admin/report-field-sequence) — Stable Report IDs (RPT-MOD-NNN), /r/:reportId shortlink, resolver for per-report column order/label/hide, admin tile in Report Builder
- [Menu Setting — Custom Tab Creation](mem://features/admin/menu-setting-custom-tabs) — Admin-created L2/L3/L4 tabs via menu_registry.is_custom + default admin-only access + dynamic sidebar synthesis
- [Hub Platform Foundation](mem://features/platform/hub-foundation) — Phase 1 observe-only Hub: module/action/capability registries, client entitlements, audit, /platform-settings shell, flag-gated, multi-tenant ready, platform_owner role
- [Hub Platform Enforcement Pilot](mem://features/platform/enforcement-pilot) — Phase 3 single-action UI enforcement for pms.data.export behind 4 gates (master + pilot flag + allowlist + entitlement); instant rollback
- [Delegated Implementation Console](mem://features/platform/implementation-console) — Scoped per-client setup for implementation_admin; write-only secrets; audited via entitlement_audit
- [Menu Setting — CAPA fallback](mem://features/admin/menu-setting-capa) — Temporary fail-open layer (dangling-parent coercion, empty-group fallback, sidebar ErrorBoundary, permissive custom-item roles) keeping admin/auditor baseline access stable until roadmap matures; removal criteria documented
- [Safety Phase 8 — Stabilization](mem://features/safety/phase8-stabilization) — Docs+tests-only close-out; 33 new SSOT tests; dead-column drop and release-readiness route both deferred with explicit re-propose criteria
- [Backup Coverage Contract](mem://infrastructure/database/backup-coverage-contract) — Phase 9.1 static regression locking RPC-driven discovery, BATCH_SIZE=4, storage buckets, no hardcoded safety allowlist
- [Backup Hard-Fail On Partial Policy](mem://infrastructure/database/backup-hard-fail-policy) — Phase 9.2 WP-a flag (default true) marks partial backups as failed; DB-level override only
- [Backup Batch Retry/Backoff Policy](mem://infrastructure/database/backup-batch-retry-policy) — Phase 9.2 WP-b transient-only retry (546/429/RateLimit), BATCH_SIZE_RETRY=2, RETRY_BUDGET_MS=8min; hard-fail terminal preserved; manual path untouched
- [Test Baseline Restoration](mem://infrastructure/test-baseline-restoration) — Migration-scan guards use latest-definition semantics; CREATE OR REPLACE preserves grants
- [Backup History Safety Drill Verify Action](mem://features/safety/backup-drill-action) — Phase 9.3 admin Flow-B verify button on non-failed Backup History rows; isolated safety_drill schema; production Safety tables read-only
- [Org KPI Data Entry — explicit Save](mem://features/admin/org-kpi-data-entry-manual-save) — ADR-075. Manual Save (card + per-row); autosave forbidden; Propagate blocked while dirty
- [Org KPI Owner Canonical Storage](mem://features/admin/org-kpi-key-normalization) — ADR-076. `org_kpi_data_owners` must store KRA/KPI byte-identical to `kpis`; canonicalize on insert; June 2026 repair migration with `org_kpi_owner_key_backup_2026_06`
- [Review Notes Sidebar Visibility](mem://features/hr/review-action-notes) — ADR-078. `HR PMS → Review Notes` sidebar gate mirrors `useReviewNoteAccess()` (view ∪ view_own_subject); POLICY §111 forbids menu→access-denied loops
- [Admin Data Entry Timeline Rendering](mem://features/review/admin-data-entry-timeline-rendering) — Render `ADMIN_DATA_ENTRY_*` rows from `metadata.fields_updated` only; suppress RAG `*_rating`; use "for X" wording for impersonal stages
- [Bulk Review Auditor Scope Filter](mem://features/review/bulk-review-auditor-scope-filter) — "My scope only" auditor toggle (default ON) + multi-category client filter; SSOT predicates in `src/lib/bulkAuditScopeFilter.ts`
- [Streaming Chunked Backup Export](mem://infrastructure/database/streaming-chunked-backup) — ADR-082 streaming part files (5k rows/part), manifest `files[]`, restore iterates parts; fixes HTTP 546 OOM at batch 46/51
- [Dashboard Aggregate RPCs](mem://infrastructure/database/dashboard-aggregate-rpcs) — ADR-083 `get_admin_dashboard_stats` / `get_management_dashboard_rows`; dashboards must use staleTime caches and not raw multi-query scans
- [Reviewer Draft Hydration (SSOT)](mem://features/review/reviewer-draft-hydration) — ADR-084 `hydrateReviewerDraft` helper; picker shows reviewer's saved value/score verbatim, never employee `achieved_value`; `AchievedValueScoreInput` guards auto-recalc
- [Orphan Incident Revival](mem://features/safety/orphan-revival) — ADR-089. Safety Admin/Head reassign flow via revive_orphaned_safety_incident RPC; FSM guard bypassed only by session flag
- [Safety Role Bulk Management](mem://features/safety/role-bulk-management) — Phase 5: CSV bulk import + export for safety_user_roles on /safety/settings/users
- [Safety Universal Data Export](mem://features/safety/data-export) — Phase 6: CSV exporter over Safety tables on /safety/settings
- [Safety Incident Routing](mem://features/safety/incident-routing) — Dept/Division → BU Head + Manager + 2nd Manager matrix, resolver precedence (dept > division > unrouted), immutable routed_* chain stamped on incidents
- [Safety Perf CAPA Wave 2](mem://infrastructure/safety-perf-capa-wave-2) — Scoped mutation invalidation + parallel severity reorder (Safety incidents)
- [Safety Perf CAPA Wave 3](mem://infrastructure/safety-perf-capa-wave-3) — Scoped training mutation invalidation + SOP assignments cap (Safety)

- [Safety Actual Reporter](mem://features/safety/actual-reporter) — Optional file-on-behalf-of (actual_reporter_id), display/audit only, set via RPC
- [Safety Duplicate Incident Handling](mem://features/safety/duplicate-incident-handling) — BU Head marks open incident as duplicate of master; Safety Head closes via dedicated RPC; SLA keeps ticking until closure
- [Safety Evidence Auto-Naming](mem://features/safety/evidence-rename) — Auto-generated {Stage}_{EmpCode}_v{n} display names; original_file_name + storage path immutable; manual rename removed
- [Safety Incident Excel Export](mem://features/safety/excel-export) — Safety-Head/Admin .xlsx export with locked columns; server-paginated over the SLA view; reuses existing xlsx dep
- [Safety Incident Advanced Filters](mem://features/safety/incident-filters) — Array-based multi-select + date-range presets on /safety/incidents; server-side .in/.gte/.lte
