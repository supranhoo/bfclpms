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

## Memories
- [Page loading overlay pattern](mem://design/page-loading-overlay-pattern) — Centered PageLoadingOverlay wired in DashboardLayout (Suspense + RouteDataLoadingGate), rocket+chart art
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
- [Safety Settings Hub (Phase X)](mem://features/safety/settings-hub) — safety_settings key/value table, get/set RPCs, admin-only writes, JSON editor at /safety/settings, six seeded business-variable keys (8/8 tests)
- [Multi-month KPI Cycle UX](mem://features/admin/multi-month-kpi-cycle-ux) — Banner contract for showing full cycle months + anchor month in admin KPI dialogs
- [Monthly Scorecard Trend](mem://features/reports/monthly-scorecard-trend) — Cache-bust + 200-ID submission batch ceiling for the Date-Range trend
- [Safety Mobile UX](mem://design/safety-mobile-ux) — Mobile primitives, sticky CTA, camera capture, FilterSheet for Safety entry-level users
- [Identity & Access Console (IAC)](mem://architecture/security/identity-access-console) — Hub-level capability-based RBAC at /admin/iac, replacing per-module role enums
- [HR Review Action Notes](mem://features/hr/review-action-notes) — HR notes for KPI changes during PMS review with admin-configurable per-role visibility and 3-state status FSM
- [Loader Branding Settings](mem://features/admin/loader-branding-settings) — Configurable rocket-overlay company name, tagline, and logo via system_settings; admin panel with live preview on Module Hub Settings
- [Safety Directives](mem://preferences/safety-directives) — Mandatory cautious-mode rules for destructive ops, errors, and privilege use
