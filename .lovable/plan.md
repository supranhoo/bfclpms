

## New Report: Variance Report (Audit vs Management Score)

### Overview
A new report showing KPIs where Auditor and Management scores differ. Columns: Employee Code, Employee Name, Department, KPI Name, Month, Auditor Score, Management Score, Variance. Filters: Month + Year. Only KPIs with score differences are displayed.

### Data Source
Query `kpis` joined with `review_submissions` (for `auditor_score` and `management_score`), `profiles` (employee details), `departments`. Filter WHERE both scores are non-null AND `auditor_score != management_score`. No new database tables or RPC needed — a simple client-side query with Supabase `.select()`.

### Files Changed

1. **`src/pages/reports/VarianceReport.tsx`** (NEW)
   - Month/Year selectors (same pattern as KpiDetailReport)
   - Search filter for employee name/code
   - Table: Code | Name | Department | Category | KRA | KPI | Month | Auditor Score | Mgmt Score | Variance (abs diff)
   - Summary cards: Total Variance KPIs, Avg Variance, Max Variance
   - Excel export with XLSX
   - Pagination

2. **`src/App.tsx`**
   - Add lazy import for `VarianceReport`
   - Add route `/reports/variance` wrapped in `<ReportRoute reportKey="variance">`

3. **`src/pages/reports/ReportsHub.tsx`**
   - Add card entry with `reportKey: 'variance'`, path `/reports/variance`, icon `TrendingUp` (or `AlertTriangle`)

4. **`DOCUMENTATION.md`** + **`POLICY.md`** — Document new report

### Query Logic (client-side)
```typescript
// Fetch KPIs for selected month/year with review_submissions
const { data } = await supabase
  .from('kpis')
  .select(`id, kra_name, kpi_name, category_id, employee_id,
    review_submissions(auditor_score, management_score),
    profiles!kpis_employee_id_fkey(employee_code, full_name, department_id,
      departments(name))`)
  .eq('review_period', month)
  .eq('review_year', year);

// Client-side filter: only rows where both scores exist AND differ
rows.filter(r => r.auditorScore !== null && r.mgmtScore !== null 
  && r.auditorScore !== r.mgmtScore);
```

### Risk Assessment
- **Data Impact**: None — read-only queries on existing tables
- **Workflow Impact**: None — additive report page
- **Regression Risk**: Zero — no changes to existing components
- **Schema Impact**: None — no database changes

