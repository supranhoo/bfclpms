## RCA summary

Employee `101784` is not missing from master data:
- Profile exists and is active: Vivek Kumar Dansena.
- Role exists: `admin`.
- KPIs exist: 54 rows across Nov-2025 to May-2026.

The screenshots show the real failure is in the reviewer dashboard roster layer: every reviewer view renders, but `Total Employees`, `Total KPIs`, and the employee list are all `0` / empty.

Most likely root cause from code + logs:
1. `EmployeeSelectorGrid` loads multiple heavy org-wide datasets on first paint: all active profiles, period KPIs, workflow-stage profiles, bulk workflow resolution, filter options, and submission score maps.
2. For HR PMS / Audit / Management / Pending-* views, `useProfilesByWorkflowStage` first fetches all active profiles, then calls `get_bulk_employee_workflows` for the full active employee set.
3. `EmployeeSelectorGrid` then calls `useBulkEmployeeWorkflows` again for the resolved list, which can be another full-org workflow RPC.
4. Recent database logs show repeated real client errors: `canceling statement due to statement timeout`. When these queries time out, React Query returns failed/empty data and the dashboard renders “No employees found”.
5. The current URL also contains persisted filters (`q=Yadav&employee=...`). The UI has a known filter-persistence pattern, so stale URL params can make an already-fragile load look like every dashboard is blank.

This is a performance/query-shape bug, not an access-rights bug.

## Risk & Impact Report

| Area | Impact |
|---|---|
| Data | No data mutation needed. Read-only dashboard query changes only. |
| Workflow | No workflow status or reviewer-chain rule changes. |
| Permissions | No RLS/menu/role change; 101784 already has admin access. |
| UI/UX | Same dashboard UI, but loading/error/empty states become accurate. |
| Regression risk | Medium because reviewer dashboards share one large component; mitigate with targeted tests and no business-rule changes. |

## Implementation plan

### 1. Stop stale URL filters from making dashboards look blank
- When switching dashboard tabs, clear `q`, `employee`, `dept`, `desig`, `grade`, `mgr`, `auditor`, `page`, and `status` together.
- On initial reviewer dashboard load, ignore an `employee=` param unless the selected employee exists in the current resolved roster or came from a valid KPI deep-link.
- Improve the empty state copy so it distinguishes:
  - no data in system,
  - no result due to filters,
  - data failed to load.

### 2. Reduce duplicate workflow-resolution calls
- In `EmployeeSelectorGrid`, avoid calling `useBulkEmployeeWorkflows` for the entire full-org roster when `useProfilesByWorkflowStage` already resolved by workflow stage.
- Only resolve workflows for employees that are needed for visible calculations:
  - visible page employees,
  - KPI employee IDs for the selected period,
  - assigned employees for audit view.
- Keep the existing workflow engine rules unchanged.

### 3. Make heavy reviewer queries resilient instead of empty
- Wrap `useProfilesByWorkflowStage` chunk calls so a timed-out chunk does not collapse the whole dashboard to zero.
- If workflow RPC fails for a chunk, use the existing fallback logic and surface a warning toast rather than showing “No employees found”.
- Add an explicit error panel with “Refresh” when `profiles`, `periodKpis`, or workflow-stage data fails.

### 4. Add query guards for auth/profile readiness
- Ensure the reviewer grid does not run org-wide queries until `useAuth().isReady`, `user.id`, and `effectiveRole` are available.
- Add defensive early returns to hooks that receive user IDs / employee IDs so no query can send a literal `null` UUID.

### 5. Regression protection
- Add unit tests for:
  - stale URL `q`/`employee` params are cleared when changing reviewer tabs,
  - reviewer grid does not render “No employees found” when a data query is still loading or errored,
  - workflow fallback keeps a non-empty roster when one workflow chunk fails.
- Add/update mock data for employee `101784` with admin role, no direct reports, and April 2026 KPIs.

### 6. Documentation / policy sync
- Update `DOCUMENTATION.md` and `POLICY.md` with the dashboard query rule: full-org reviewer dashboards must be period-scoped, paginated/chunked, and must not show a hard empty state on query failure.
- Update the relevant memory for reviewer dashboard performance/query behavior.

## Expected result

For Vivek (`101784`), the dashboards should stop collapsing to zero. If a query fails, he will see a clear load/error state and a refresh action; otherwise the relevant April 2026 employee/KPI counts will populate normally.