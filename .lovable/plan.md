# Workflow Resolution Report

## Problem

Today the only "Workflow Configuration Report" is the **Export Report** button on `/admin/workflow-config`. Its sheets list:
- Templates (definitions only)
- Employee / Department / PMS-Grade **Overrides**

Most employees use the **default template** and have no override row, so they never appear. To anyone reading the export, it looks "blank" — and there is no on-screen view at all to answer questions like *"Why does Tanaaz / April 2026 show N/A for Skip-Level?"*.

## Goal

Add a new **in-app**, **period-aware** report that lists every active employee with the **fully-resolved** workflow chain for a chosen month + year, so admins can see at a glance which stages are active, which user fills each stage, and why a stage is N/A.

## Scope

### 1. New page: `/reports/workflow-resolution`

- Listed in `ReportsHub` under the "Configuration" / "Workflow" group.
- Route registered in `src/App.tsx`, lazy-loaded like its siblings.
- Access: same roles allowed today on `/admin/workflow-config` + Management + HR PMS + Auditor (read-only). No Employee access.

### 2. Filters (top bar)

- **Period** (Month dropdown — Jan…Dec) — defaults to current month
- **Year** (defaults to current fiscal year)
- **Department** (multi-select)
- **PMS Grade** (multi-select)
- **Employee** (search-as-you-type, name / code / email)
- **Template** (multi-select; populated from active + archived templates)
- **Stage filter** chip row: "Show only employees with N/A in __" → Self / L1 / Skip-Level / HR PMS / Auditor / Management
- "Active employees only" toggle (default ON, per Core memory)

### 3. Table columns

| Group | Columns |
|---|---|
| Identity | Employee Code, Name, Department, PMS Grade |
| Resolution | Resolved Template, Source (Employee override / Department / PMS-Grade / Default), Period-Specific (Yes/No) |
| Resolved chain (period-aware) | Self, L1 Manager, Skip-Level, HR PMS, Auditor, Management |
| Diagnostics | Stages skipped (chips), N/A reason chip when any stage is N/A |

Each chain cell shows the **resolved user's name** + small badge. When N/A, the cell shows the **reason chip** — one of:
- `Stage not in template`
- `No manager_id on profile`
- `Skip-level = manager (loop)`
- `Resolved user inactive`
- `Stage role unassigned`

A row click opens a side panel with the full evaluation trace (template stages array, override row id if any, raw `manager_id` / `manager.manager_id` chain, final users at each stage).

### 4. Resolution logic (single source of truth)

- All resolution runs through the **same** function the runtime workflow engine uses today (the resolver behind `getEmployeeWorkflow` / `get_bulk_employee_workflows`). The report does **not** re-implement chain logic — that would create the "two standards" problem the user has flagged before.
- Bulk-resolve in batches of 200 employees per RPC call (per Core memory: handle 1000-row DB limit with batched fetching).
- Memoized client-side cache keyed by `(period, year)`.

### 5. Exports

- **Export Excel** button reuses the period-aware resolved rows (not just overrides). Sheet matches the on-screen columns.
- **Export filtered view** (respects current filters).

### 6. Admin export upgrade (small, additive)

On `/admin/workflow-config`, the existing `WorkflowConfigExport` gets one new sheet **"All Employees (Resolved)"** that calls the same resolver for the currently-selected period in the page header (or "Global" if none). The existing 4 sheets are left unchanged. This eliminates the "blank report" perception even for users who never visit the new page.

### 7. Tests + mocks (per workspace SSOT rule)

- Unit test: resolver wrapper returns same chain for an employee on `/admin/workflow-config` page and on the new report (parity test — guards against future drift).
- Unit test: each of the 5 N/A reason chips fires for the correct fixture.
- Mock data: include Tanaaz / Ravi-Naidu-style fixture (manager_id NULL → `No manager_id on profile`) and a self-loop fixture.

### 8. Documentation + memory sync

- Update `DOCUMENTATION.md` (new section "Workflow Resolution Report" + bump version).
- Update `POLICY.md` to record: report is read-only, period-aware, uses canonical resolver, must never diverge from runtime workflow engine.
- Update `mem://features/admin/workflow-configuration-report` to cover the new on-screen report and N/A-reason chip taxonomy.
- New ADR entry under `docs/adr/` documenting the "single resolver" decision.

## Risk & Impact Report

- **Data Impact**: Read-only. No schema, no RLS changes. Resolver is the existing one.
- **Workflow Impact**: None — pure reporting surface.
- **UI/UX Consistency**: New page mirrors styling of `KpiStatusTracker` / `BottleneckReport` for filters + table. Added to `ReportsHub` group, sidebar entry under Reports.
- **Regression Risk**: Low. The only existing-file edit is one extra sheet appended to `WorkflowConfigExport.tsx` (additive). Parity unit test guards against the resolver ever drifting.
- **Mitigation**: Single shared resolver call, parity unit test, and a feature flag (`reports.workflow_resolution.enabled`, default ON) so it can be toggled from admin settings without a redeploy.

## Out of scope

- No edits to the workflow engine or chain-resolution logic itself.
- No changes to RLS or template definitions.
- No bulk re-assignment / fix actions (read-only report). A follow-up plan can add "Fix" deep-links from N/A chips to the relevant admin screen.
