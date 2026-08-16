# Performance Console: access for Auditor / Management + Review Pipeline

## Where things stand today (verified)

- Route `/admin/bu-console` is wrapped in `ProtectedRoute allowedRoles={['admin']}` with no `menuKey`, and the sidebar entry is `roles: ['admin']`. Only Admin can open it.
- The database is already broader: `bu_console_can_read()` returns true for `admin`, `auditor`, `management`, `hr_pms`, and every read RPC (tree, rows, KPI detail) uses it.
- Every write RPC (group definition edit, group value entry, group approval, row overrides) checks `has_role(user,'admin')` only.
- There is no pipeline / review-cycle list in the console. Tabs are Console, KRA Tree, KPI Library. Review cycles still live only in the employee-by-employee dashboards.

Net: the backend already supports read-only Auditor and Management access; only the front door is closed.

## Part 1 — Granting access

**A. Role-based (fast path)**
- Sidebar item roles become `['admin','management','auditor','hr_pms']` and gain the existing `menuKey: 'admin-bu-console'`.
- Route guard becomes the same role list plus `menuKey="admin-bu-console"`, so Menu Access / Access Profiles can still revoke or extend per user.
- Place the entry sensibly per role (Management group for management, Audit group for auditor) instead of exposing the admin-only KRA Settings section.

**B. Grant-based (per person, no role change)**
- Because the route carries `menuKey='admin-bu-console'`, Admin → Menu Access Rights → Access Profiles / User Overrides can grant the console to one named auditor or management user, exactly like Data Entry works today.

**Read-only enforcement**
- Add `useBuConsoleCapability()` returning `{ canRead, canWrite }`; `canWrite` = admin, or an explicit `edit` right on `admin-bu-console`.
- When `canWrite` is false the console renders in Explorer-style read-only mode (the pattern already used for Audit/Management Explorer Mode): hide group edit, group value entry, approvals, row-override "Tune", KRA Tree create/edit and merge actions; show an amber read-only banner.
- Server stays the source of truth — writes already reject non-admins; the UI change only removes dead-end buttons.
- Widening writes later means replacing the `has_role('admin')` checks with a `bu_console_can_write()` function; out of scope unless you want Management to edit.

## Part 2 — Review Pipeline (new tab)

Goal: run the review cycle from the console instead of employee-by-employee, wired to the existing workflow tables and dashboards.

**New tab "Pipeline"** beside Console / KRA Tree / KPI Library, sharing the same scope toolbar (period, year, division, BU, department, manager — multi-select and cascading, per the filter standard).

```text
[ Stage rail ]  Self  >  Manager  >  Skip  >  Dept  >  BU  >  HR  >  Mgmt  >  Done
                 12      48         6        20      9     3      1        181
[ Group rows ]  KRA / KPI group -> employees at each stage, oldest pending age,
                blockers (no score, N/A, open query, evidence missing)
[ Row expand ]  the employees inside that cell, linking into the existing
                scorecard / annual review detail routes
```

**Behaviour**
- Clicking a stage chip filters rows to that stage; clicking a cell expands the employee list.
- Each employee row deep-links to the existing dashboard/scorecard route — no review logic duplicated.
- Aging buckets (0-3d / 4-7d / 8+d) drive urgency colour, reusing the reviewer-grid urgency convention.
- Bulk actions (nudge reviewer, bulk approve) render only for `canWrite` users and reuse the existing bulk-approval and notification RPCs.

**Data**
- One new read RPC `bu_console_pipeline(p_period, p_year, p_bu_ids, p_dept_ids, p_manager_ids, p_limit, p_offset)`, `SECURITY DEFINER`, gated by `bu_console_can_read()`, returning per-stage counts plus a paged row set. Server-side pagination and server-side distinct people counts (POLICY §CONSOLE-DISTINCT-PEOPLE).
- Stage derivation reuses the canonical "status = last completed stage" convention and existing per-employee workflow resolution — no new stage logic.

## Technical notes

- Files touched: `src/App.tsx` (route guard), `src/components/layout/AppSidebar.tsx` (roles + placement), new `src/hooks/useBuConsoleCapability.ts`, new `src/components/admin/bu-console/PipelineTab.tsx` + `pipelineModel.ts`, `src/pages/admin/BuConsole.tsx` (tab + read-only mode), one migration for `bu_console_pipeline`.
- Tests: capability gating (read-only hides every write affordance), pipeline stage bucketing and aging, pagination guard.
- Docs: ADR-284 (console access tiers) and ADR-285 (pipeline), POLICY §CONSOLE-ACCESS-TIERS and §CONSOLE-PIPELINE, DOCUMENTATION.md updated in the same step.

## Risk

- Data: no schema change beyond one read RPC; additive. Rollback = drop the function and revert the route roles.
- Access: widening the route without read-only mode would expose admin-only buttons that fail server-side — the capability hook ships in the same change.
- Scale: pipeline is server-paged and scope-gated; nothing loads until a scope is applied, as with the rest of the console.

## Question before build

Should Management be able to **act** in the pipeline (bulk approve / nudge), or stay strictly read-only alongside Auditor?