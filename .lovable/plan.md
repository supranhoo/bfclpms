

## New Report: Team Vs Manager Monthly Score Summary

### What You Asked For
A new report showing each employee's average final score alongside their reporting manager's average final score for the selected month, with columns: Employee Code, Employee Name, Designation, Department, Month, Year, Avg Final Score, Reporting Manager Code, Reporting Manager Name, Manager Avg Final Score.

### Technical Approach

#### 1. New Report Page: `src/pages/reports/TeamVsManagerScoreReport.tsx`
Pattern follows existing reports (ManagerTeamKpiReport, EmployeePerformanceSummary):
- Month/Year selectors, search bar, pagination, Excel download
- **Data query**: Fetch all KPIs for the selected period with `review_submissions(final_score, is_na)` and employee profiles (full_name, employee_code, designation, department, reporting_manager_id)
- **Computation**:
  - Group KPIs by employee_id
  - For each employee: compute weighted avg of `final_score` across non-N/A KPIs (using weightage)
  - Look up reporting manager's profile (name, code)
  - Compute the manager's own weighted avg final score from their KPIs in the same period
- **Table columns**: Employee Code | Employee Name | Designation | Department | Month | Year | Avg Final Score | Reporting Manager Code | Reporting Manager Name | Manager Avg Final Score
- Color-coded score badges using existing `getScoreBadgeClass`
- Excel export with all columns

#### 2. Register in ReportsHub
Add card entry in `src/pages/reports/ReportsHub.tsx` with reportKey `team-vs-manager-score`.

#### 3. Register Route in App.tsx
Add lazy import + route `/reports/team-vs-manager-score` wrapped in `ReportRoute`.

#### 4. Register Report Access
Add `team-vs-manager-score` to the report access config so admins can control visibility.

### Files Changed
| File | Action |
|------|--------|
| `src/pages/reports/TeamVsManagerScoreReport.tsx` | **New** — full report page |
| `src/pages/reports/ReportsHub.tsx` | Add report card entry |
| `src/App.tsx` | Add lazy import + route |

### Risk Assessment
- **Data**: Read-only, no schema changes
- **Regression**: Zero — additive new page only
- **Security**: Protected by ReportRoute + report_access_config

