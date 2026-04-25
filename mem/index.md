# Project Memory

## Core
Always sync DOCUMENTATION.md + POLICY.md in the same step as code changes; append to Version History.
Every bug fix needs a regression test in src/test/bugBountyFixes.test.ts.
Use semantic design tokens (HSL) — never raw colors in components, except inside isolated brand SVG art.
Centered PageLoadingOverlay is for page navigation + initial data loads only; refresh actions use inline button feedback (POLICY.md §103).
Per-KPI status-transition aggregations MUST read from `public.kpi_audit_logs` (join via `kpi_id`) — never `audit_logs` (does not exist) — using canonical status literals: self_review / manager_check / skip_level_check / hr_pms_review / audit / management_review / kra_set / approved.

## Memories
- [Page loading overlay pattern](mem://design/page-loading-overlay-pattern) — Centered PageLoadingOverlay wired in DashboardLayout (Suspense + RouteDataLoadingGate), rocket+chart art
- [KPI audit logs canonical](mem://architecture/database/kpi-audit-logs-canonical) — Canonical table & status vocabulary for workflow-transition aggregations (BUG-031)
