

## KPI Journey Timeline Report

### What this report answers
For every KPI assigned to an employee, show the complete lifecycle timeline: when was it created, when did the employee submit self-review, when did the manager approve/send back, when did each subsequent reviewer act, and how long each stage took. This lets admins see whether timelines were followed and where delays occurred.

### Data source
The `kpi_audit_logs` table already captures every action (SELF_REVIEW_SUBMITTED, MANAGER_APPROVED, SKIP_LEVEL_APPROVED, HR_PMS_APPROVED, AUDITOR_APPROVED, MANAGEMENT_APPROVED, send-backs, queries, etc.) with `created_at` timestamps and `performed_by` user IDs. No new database tables or migrations are needed.

### Report layout

**Filters**: Review Period, Review Year, Department, Employee search, Status filter

**Summary cards** (top row):
- Total KPIs in scope
- Avg days from KRA Set to Self Review
- Avg days from Self Review to Final Approval
- KPIs still pending (not yet approved)

**Main table** (flat, one row per KPI):

| Emp Code | Employee | Dept | Category | KRA | KPI | Month | KRA Assigned | Self Submitted | Manager Action | Skip-Level | HR PMS | Auditor | Management | Final Approved | Total Days | Current Status |
|----------|----------|------|----------|-----|-----|-------|-------------|----------------|----------------|------------|--------|---------|------------|----------------|------------|----------------|

- Date columns show the timestamp from `kpi_audit_logs` for each stage action
- "Total Days" = difference between KRA creation and final approval (or today if not yet approved)
- Color-coded duration badges: Green (within SLA), Amber (near SLA), Red (overdue)

**Timeline compliance column**: A visual indicator (checkmark/warning) showing whether the KPI journey followed the expected timeline based on review period stage deadlines.

**Excel export**: Full dataset download with all columns.

### Technical approach

1. **New page**: `src/pages/reports/KpiJourneyReport.tsx`
   - Query `kpis` joined with `kpi_audit_logs` for the selected period
   - Group audit logs by `kpi_id`, extract the earliest timestamp for each action type per KPI
   - Join `profiles` and `departments` for employee context
   - Paginated table with sorting

2. **New hook**: `src/hooks/useKpiJourneyReport.ts`
   - Fetches KPIs for selected month/year with employee profiles
   - Fetches audit logs for those KPI IDs in a single batched query
   - Pivots logs into a per-KPI timeline map: `{ kpiId → { self_submitted_at, manager_acted_at, ... } }`

3. **Register in reports hub**: Add card to `src/pages/reports/ReportsHub.tsx`

4. **Add route**: Register in `src/App.tsx` with lazy loading, wrapped in `ReportRoute`

5. **Report access**: Add `kpi-journey` key to report access system

### Files to create/modify
- **Create**: `src/pages/reports/KpiJourneyReport.tsx`
- **Create**: `src/hooks/useKpiJourneyReport.ts`
- **Modify**: `src/pages/reports/ReportsHub.tsx` (add report card)
- **Modify**: `src/App.tsx` (add route)

No database migrations needed -- all data already exists in `kpi_audit_logs`.

