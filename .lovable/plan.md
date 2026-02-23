

# Workflow Bottleneck Report -- "Where Is It Stuck?"

## Purpose

A new report page that answers: **"For each employee, which KPIs are stuck at which workflow stage, who is the responsible reviewer, and how long have they been waiting?"** This gives HR/Admin a clear view of workflow bottlenecks across the organization.

## Report Layout

### Summary Cards (Top)
- **Total Pending KPIs** -- all KPIs not yet "approved"
- **Stuck at Self Review** -- count of KPIs at `self_review`
- **Stuck at Manager** -- count at `manager_check`
- **Stuck at Auditor/Management** -- combined count at `audit` + `management_review`
- **Avg Days Pending** -- average days since `updated_at` for non-approved KPIs

### Bottleneck Distribution Chart
A horizontal stacked bar chart showing how many KPIs are waiting at each workflow stage, broken down by department.

### Filters
- Year, Period (month), Department, Division, Business Unit, Status stage, Search (employee name/code)

### Detail Table (Main Content)
| Emp Code | Employee Name | Department | KPI Name | Period | Current Stage | Responsible Person | Days Pending | Last Updated |
|----------|--------------|------------|----------|--------|--------------|-------------------|-------------|-------------|

- **Current Stage**: Human-readable label (e.g., "Awaiting Manager Review")
- **Responsible Person**: For `self_review` it's the employee; for `manager_check` it's the reporting manager; for `audit` it's the auditor role; etc.
- **Days Pending**: Calculated as `today - updated_at` (number of days the KPI has been at the current stage)
- Color-coded urgency: Green (0-7 days), Amber (8-14 days), Red (15+ days)

### Excel Export
Full table export with all columns.

## Technical Plan

### 1. New hook: `src/hooks/useBottleneckReport.ts`

- Fetches all non-approved KPIs with profiles join (`full_name`, `employee_code`, `department_id`, `reporting_manager_id`)
- Fetches department/BU/division hierarchy
- Joins reporting manager names for the "Responsible Person" column
- Computes `daysPending = Math.floor((Date.now() - new Date(kpi.updated_at).getTime()) / 86400000)`
- Maps `kpi.status` to human-readable stage labels and determines responsible person based on stage
- Returns filtered, sorted, paginated rows

### 2. New page: `src/pages/reports/BottleneckReport.tsx`

- Summary stat cards
- Recharts horizontal bar chart for stage distribution
- Filter bar (year, period, department, status stage, search)
- Paginated detail table with color-coded "Days Pending" badges
- Excel export button

### 3. Wire into routing

- Add lazy import in `App.tsx`
- Add route `/reports/bottleneck`
- Add card entry in `ReportsHub.tsx`

### 4. Documentation

- Bump version to **1.45.84**
- Document the new report in `DOCUMENTATION.md`

## Files to Create/Modify

| File | Action |
|------|--------|
| `src/hooks/useBottleneckReport.ts` | **Create** -- data fetching and processing |
| `src/pages/reports/BottleneckReport.tsx` | **Create** -- full report page |
| `src/App.tsx` | **Modify** -- add lazy import + route |
| `src/pages/reports/ReportsHub.tsx` | **Modify** -- add report card |
| `DOCUMENTATION.md` | **Modify** -- version bump + feature docs |

## Risk Assessment

| Aspect | Detail |
|--------|--------|
| Data impact | None -- read-only report using existing `kpis` + `profiles` tables |
| DB changes | None |
| RLS impact | None -- uses existing admin/auditor SELECT policies |
| Regression risk | None -- additive feature, no existing code modified except routing |

