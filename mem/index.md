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
- [Image Compression Policy](mem://features/image-compression-policy) — Phase A client-side compression for Safety + PMS evidence; system_settings flags, skip rules, severity overrides
- [Server-side Image Compression (Phase B)](mem://features/image-compression-server) — WebP re-encoder edge function, queue table, pg_cron, PMS rewrite safety flag
- [Safety Roadmap Phases 2-7](mem://features/safety/roadmap-phase2-7) — Pointer to docs/safety-roadmap-phase2-7.md with Status Tracker for PTW, Training, Assets, Audits, Emergency, Analytics
- [Safety Permit-to-Work](mem://features/safety/permits-to-work) — Phase 2 PTW lifecycle, RPC-only transitions, configurable per-type approval ladders, HIRA/LOTO requirements, /safety/permits routes
- [Safety Training & SOPs (Phase 3)](mem://features/safety/training-and-sops) — RPC-only training lifecycle, server-scored quizzes, scroll-locked reader, daily overdue sweep
- [Safety Assets & Calibration (Phase 4)](mem://features/safety/assets-and-calibration) — Asset register, record_calibration RPC + history, T-7/T-1/overdue daily sweep, PTW expiry block (23/23 tests)
- [Safety Audit Checklists (Phase 5)](mem://features/safety/audit-checklists) — Templated audits with weighted scoring, critical-fail auto-incidents, RPC-only lifecycle, BU scoreboard (11/11 tests)
