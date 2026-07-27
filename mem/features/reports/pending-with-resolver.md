---
name: Pending With Resolver
description: SSOT for "Pending With (Name)" on KPI reports — resolver lib + shared context service, workflow-chain driven
type: feature
---
Any report showing who a pending KPI is waiting on MUST use:
- `resolvePendingWith()` — `src/lib/kpiPendingWith.ts` (pure decision logic)
- `buildPendingWithContext()` / `resolvePendingWithForKpi()` — `src/services/reports/pendingWithResolver.ts` (input assembly)

Next stage always comes from `get_bulk_employee_workflows` (POLICY §105) — never a hardcoded stage→role map.
Per-KPI `audit_kpi_level_assignments` override the global auditor pool. Queue labels (HR PMS / Audit / Management) are fallbacks only.
Approved, frequency-locked and workflow-orphaned rows render `—`.

Consumers: KpiStatusTracker (field `pending_with`, sort 145), KpiScorecardDetail (field `pending_with`, sort 295).
Codified in POLICY.md §RPT-PENDING-WITH-SSOT / ADR-178.
