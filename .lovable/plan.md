

# Management Dashboard Redesign

## Current State
The existing dashboard has: 5 stat cards, rating distribution pie chart, department bar chart, pending reviews table, department overview table, and quick actions. It lacks several executive-level sections from your wireframe.

## What's Missing (Gap Analysis)

| Wireframe Section | Current Status |
|---|---|
| Quarter/Period selector | Exists (Year + Period) |
| Department/Location/Manager filters | Exists (KpiFilterBar) |
| Compare Period Toggle | Partial (auto-compares with previous period) |
| Export Report Button | Missing |
| KPI Snapshot Cards | Exists but missing "Avg Score" card |
| Performance Trend (Line Chart) | Missing |
| Rating Distribution (Histogram) | Exists as Pie — needs histogram option |
| Department Performance Table | Exists but missing Risk Flags column |
| Top Performers list | Missing |
| Bottom Performers list | Missing |
| Action Items / Approvals section | Missing |
| Reviewer Analytics (Score Bias) | Missing |
| Training Gap Insights | Missing |
| Audit Log (Recent changes) | Missing |
| Notifications / Alerts | Missing |

## Plan

### 1. Enhance Header Actions
- Add "Export Report" button (PDF export using existing `jspdf` + `jspdf-autotable`)
- Keep existing Year + Period selectors

### 2. Add "Avg Score" Stat Card
- Replace "Total KPIs" card with a more prominent "Avg Score" card showing the weighted average with trend indicator

### 3. Performance Trend Line Chart (new section)
- Query KPIs grouped by `review_period` for the selected year
- Plot a line chart (using existing `recharts` LineChart) showing avg score per month
- Shows score progression over the year

### 4. Convert Rating Distribution to Histogram
- Replace the Pie chart with a vertical BarChart showing score band counts (Excellent/Good/Average/Poor)
- More intuitive for management to read distribution at a glance

### 5. Department Table — Add Risk Flags
- Add a "Risk Flags" column counting employees with avg score < 50% per department
- Color-code rows with high risk counts

### 6. Top & Bottom Performers Section (new)
- Two side-by-side cards
- **Top 5**: Employees with highest weighted avg score, showing score and department
- **Bottom 5**: Employees with lowest weighted avg score, with a link to PIP management
- Data derived from the same KPI query already fetched (employee score map exists in current code)

### 7. Action Items / Approvals Section (new)
- Three mini-cards in a row:
  - **Overdue Reviews**: KPIs stuck in non-terminal stages > 7 days (from `updated_at`)
  - **Pending Rollbacks**: Already fetched from `kpi_rollback_requests`
  - **Open Queries**: Already fetched

### 8. Reviewer Analytics — Score Bias (new)
- Query `review_submissions` grouped by manager (from `profiles.reporting_manager_id`)
- Calculate each manager's average score deviation from the org mean
- Display as a compact table: Manager Name | Avg Score Given | Deviation | # Reviews

### 9. Training Gap Insights (new)
- Use the existing `useTNI` hook (`useTNISummary` / `useTNIByDepartment`)
- Show summary: total employees flagged for training, top 3 departments with most gaps
- Link to full TNI Report

### 10. Recent Audit Log (new)
- Query last 10 entries from `kpi_audit_logs` with profile joins
- Display as a compact timeline: timestamp, action, employee name, KPI name

### 11. Notifications Summary (new)
- Query recent unread notifications for the management user
- Show count badge and last 3-5 notification summaries with "View All" link to `/inbox`

## Files to Modify
1. `src/pages/ManagementDashboard.tsx` — Main page, add all new sections and data queries
2. `DOCUMENTATION.md` — Atomic sync
3. `POLICY.md` — Atomic sync

## Risk Assessment
- **Data Impact**: Read-only queries only, no schema changes
- **Performance**: Some new queries (audit logs, reviewer analytics) — will use `.limit()` and parallel fetching within the existing `useQuery`
- **Regression Risk**: Low — additive changes to an existing page, no existing logic removed

