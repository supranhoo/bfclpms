

## New Report: "Same KPI — Manager vs Team" Comparison

### Overview
A new report that identifies KPIs shared between a reporting manager and their direct reports, compares their final scores, and only displays rows where scores differ. This helps highlight scoring discrepancies on identical KPIs across reporting hierarchies.

### Data Logic
1. Query all `kpis` for the selected month/year, joining `profiles` (for employee details, `reporting_manager_id`) and `review_submissions` (for `final_score`)
2. For each employee KPI, look up whether their reporting manager has the same `kpi_name` in the same period
3. If both exist and both have `final_score`, compare them — only include rows where scores differ
4. Display: Employee Code, Employee Name, Department, KPI Name, Manager Name, Employee Score, Manager Score, Variance (Manager - Employee)

### Columns
| Employee Code | Employee Name | Department | KPI Name | Manager Name | Employee Score | Manager Score | Variance |

### Filters
- Month selector
- Year selector
- Search (name, code, KPI, department)

### Summary Cards
- Total Mismatched KPIs
- Avg Variance
- Max Variance

### Files to Create/Modify

1. **`src/pages/reports/ManagerTeamKpiReport.tsx`** (NEW)
   - Follows the exact same pattern as `VarianceReport.tsx`
   - Query: fetch all KPIs with profiles and review_submissions for the period
   - Client-side: group by `kpi_name`, match employee to their manager's KPI, filter where scores differ
   - Table with pagination, search, export
   - Green badge for positive variance, red for negative

2. **`src/App.tsx`**
   - Add lazy import for `ManagerTeamKpiReport`
   - Add route `/reports/manager-team-kpi` wrapped in `<ReportRoute reportKey="manager-team-kpi">`

3. **`src/pages/reports/ReportsHub.tsx`**
   - Add card entry with title "Same KPI — Manager vs Team", icon `Users`, path `/reports/manager-team-kpi`, reportKey `manager-team-kpi`

4. **`src/hooks/useReportAccess.ts`**
   - Add `'manager-team-kpi'` to `DEFAULT_CONFIGS` with view roles `['admin', 'manager', 'management', 'hr_pms']`

5. **Database migration**
   - Insert `report_access_config` row for `manager-team-kpi` so the report is visible

6. **`DOCUMENTATION.md`** / **`POLICY.md`** — Version history update

### Technical Approach

```typescript
// Pseudocode for matching logic
const allKpis = await supabase.from('kpis')
  .select(`id, kpi_name, employee_id, review_period, review_year,
    review_submissions(final_score),
    profiles!kpis_employee_id_fkey(employee_code, full_name, department_id, reporting_manager_id,
      departments(name))`)
  .eq('review_period', month).eq('review_year', year);

// Build manager KPI map: { managerId -> { kpiName -> finalScore } }
// For each employee KPI, check if manager has same kpi_name
// Only include where both scores exist and differ
```

### Risk Assessment
- **Data Impact**: None — read-only queries on existing tables
- **Workflow Impact**: None — additive report page
- **Regression Risk**: Zero — no changes to existing components
- **Schema Impact**: One additive row in `report_access_config`

