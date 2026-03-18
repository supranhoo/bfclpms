

## Reports Audit — Findings

### All 15 Reports: Routing & Access Control Status

| # | Report | Route | App.tsx Route | ReportRoute Guard | Status |
|---|--------|-------|---------------|-------------------|--------|
| 1 | Employee Performance Summary | /reports/employee-summary | Yes | Yes | OK |
| 2 | Performance Report | /reports/performance | Yes | Yes | OK |
| 3 | Monthly Scorecard | /reports/monthly-scorecard | Yes | Yes | OK |
| 4 | KRA Issuance | /reports/kra-issuance | Yes | Yes | OK |
| 5 | Query Report | /reports/queries | Yes | Yes | OK |
| 6 | Unified Issues Report | /reports/issues | Yes | Yes | OK |
| 7 | Completion Report | /reports/completion | Yes | Yes | OK |
| 8 | Department Summary | /reports/department | Yes | Yes | OK |
| 9 | **Manager Team Report** | /reports/manager-team | **NO** | **NO** | **MISSING ROUTE** |
| 10 | Audit Trail Report | /reports/audit-trail | Yes | Yes | OK |
| 11 | **Period Comparison** | /reports/period-comparison | **NO** | **NO** | **MISSING ROUTE** |
| 12 | TNI Report | /reports/tni | Yes | Yes | OK |
| 13 | KPI Detail Report | /reports/kpi-detail | Yes | Yes | OK |
| 14 | KPI Mapping Matrix | /admin/kpi-mapping | Yes (admin) | No (ProtectedRoute) | OK (admin-only) |
| 15 | Workflow Bottleneck | /reports/bottleneck | Yes | Yes | OK |
| 16 | KPI Status Tracker | /reports/kpi-status-tracker | Yes | Yes | OK |
| 17 | KPI Journey Timeline | /reports/kpi-journey | Yes | Yes | OK |

### Issues Found

**Issue 1: Two dead-link report cards in ReportsHub**
- "Manager Team Report" links to `/reports/manager-team` — no route exists in App.tsx, no page component exists. Clicking navigates to a 404.
- "Period Comparison" links to `/reports/period-comparison` — no route exists in App.tsx, no page component exists. Clicking navigates to a 404.

**Issue 2: Console warning (non-blocking)**
- `WorkflowStagesPreview` in `WorkflowConfig.tsx` receives a ref but is not wrapped in `React.forwardRef()`. This is a warning only, not a crash.

### No Other Issues Found
- All 15 existing report pages have matching lazy imports, route definitions, and `ReportRoute` access guards.
- The KPI Journey Report's new "Type" column (Org/Individual) is properly wired with `isOrgKpi` field, filter, and Excel export.
- Report access control via `useReportAccess` hook is consistently applied across all routed reports.

---

### Recommended Fix

**Option A (Remove dead cards):** Remove the "Manager Team Report" and "Period Comparison" entries from the `reports` array in `ReportsHub.tsx` since no page components exist for them.

**Option B (Build the pages):** Create `ManagerTeamReport.tsx` and `PeriodComparisonReport.tsx` page components, add routes to `App.tsx`, and add `report_access_config` entries. This is a larger effort.

**Also fix:** Add `React.forwardRef` to `WorkflowStagesPreview` in `WorkflowConfig.tsx` to resolve the console warning.

