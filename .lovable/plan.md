## Goal

KPI Status Tracker currently shows only **Pending At Level** (a role label such as "Manager", "HR PMS"). Add a **Pending With (Name)** column that names the actual person(s) the KPI is waiting on.

## Verified current state

- `src/pages/reports/KpiStatusTracker.tsx` (676 lines) builds `StatusTrackerRow` from `kpis` + paginated `profiles`. It has `pendingAt` from the hardcoded `PENDING_AT_MAP` role labels only — no person names. It already fetches per-employee workflow chains via `useBulkEmployeeWorkflows` (used for orphan detection).
- A tested pure resolver already exists: `src/lib/kpiPendingWith.ts` → `resolvePendingWith()` (tests in `src/test/kpiPendingWith.test.ts`). It handles kra_set → org KPI data owners / employee, self_review → manager, reviewer stages → next stage in the resolved chain (skip-level name, HR PMS / Auditor / Management names, falling back to queue labels).
- `src/pages/reports/KpiScorecardDetail.tsx` (lines 227–356) already assembles all the inputs that resolver needs: org KPI data owners map, global `hr_pms` / `management` / `auditor` role name pools, per-KPI auditor overrides from `audit_kpi_level_assignments`, skip-level manager (manager's `reporting_manager_id`), and `get_bulk_employee_workflows` chains. That enrichment block is inline in the page and is not currently reusable.

## Changes

**1. Extract the enrichment into a shared service (SSOT)** — new `src/services/reports/pendingWithResolver.ts`:
- `buildPendingWithContext({ kpiIds, employeeIds, month, year })` → fetches (all chunked/paged, same patterns as today): data-owner map, role-name pools, per-KPI auditor overrides, manager + skip-manager names, workflow stage chains.
- `resolvePendingWithForKpi(ctx, kpi)` → thin wrapper that calls the existing `resolvePendingWith()`. No logic change; the pure resolver stays the single decision point.

**2. `KpiStatusTracker.tsx`**
- Add `reporting_manager_id` to the existing paginated profiles select.
- After the main KPI fetch, build the context once and set `pendingWithName: string` on each `StatusTrackerRow` (`'—'` when nothing is pending).
- Add field `pending_with` (default label **"Pending With (Name)"**, `default_sort: 145`) to `KST_DEFAULT_FIELDS`, so admins can rename/hide it via Report Field settings.
- Render the column in the table immediately after "Pending At Level"; truncate long multi-name values with a tooltip/title.
- Include it in `valueFor()` for the Excel export.
- Extend the search filter to match `pendingWithName`, so "show me everything sitting with X" works.

**3. `KpiScorecardDetail.tsx`** — replace its inline enrichment block with calls to the new service. Behaviour-identical; guarded by the existing `kpiPendingWith` tests.

**4. Tests** — `src/services/reports/__tests__/pendingWithResolver.test.ts`: context-shaping tests with mock data (per-KPI auditor override beats global pool; missing manager → em-dash; org KPI at `kra_set` → data owners; approved → em-dash).

**5. Docs** — ADR-178 in `DOCUMENTATION.md` + `POLICY.md §RPT-PENDING-WITH-SSOT`: any report showing "who is this pending with" must resolve it through `resolvePendingWith` over a workflow chain from `get_bulk_employee_workflows` — never a hardcoded stage→role map.

## Risk & impact

- **Data:** none — read-only report, no schema/RLS change.
- **Workflow:** none.
- **UI/UX:** one extra column on an already horizontally scrolling table; hideable via Report Field settings. Filter row unchanged.
- **Performance:** adds ~4 extra chunked reads per report load (data owners, user_roles, auditor assignments, manager lookups) on top of the existing workflow RPC. All are `.in()`-chunked at 500 and paged at 1000, matching the KPI Scorecard Detail cost profile.
- **Regression risk:** low for the tracker (additive). Moderate-but-contained for KPI Scorecard Detail because of the refactor — mitigated by keeping the extracted code byte-equivalent in behaviour and by the existing resolver test suite.
- **Rollback:** revert the two page files + delete the new service (and the doc entries).
