

## Plan: KPI Scorecard Detail Report (Flat Table, No Row Limit)

### What We're Building
A new report at `/reports/kpi-scorecard-detail` — a flat table with **one row per KPI** showing employee details and all stage scores. No pagination limit on data fetch; all KPIs for the selected period are loaded using the same batch-fetch loop as the existing KPI Detail Report.

### Columns
Employee Code, Name, Designation, Department, Month, Category, KRA, KPI, Weightage, Self, Manager, Skip-Level, HR PMS, Auditor, Management, Final Score, Status

### Data Fetching Strategy
- Reuse the proven batch-fetch pattern from `KpiDetailReport.tsx` (loop with `range(offset, offset+999)` until fewer than 1000 rows returned) — this bypasses the Supabase 1000-row default limit
- Fetch `profiles` (with `designation`, `departments`) in a single query
- Join client-side into flat rows

### Features
- Month/Year selectors, department filter, search (name/code/KPI)
- Sortable column headers (reuse pattern from `KpiDetailsTable`)
- Client-side pagination for UI performance (default 100 rows per page)
- Excel export of **all filtered rows** (not just current page) via `xlsx`
- Report access controlled via `kpi-scorecard-detail` key

### Files to Create/Modify

| File | Change |
|------|--------|
| `src/pages/reports/KpiScorecardDetail.tsx` | **New** — full report page |
| `src/pages/reports/ReportsHub.tsx` | Add card entry |
| `src/App.tsx` | Add lazy route `/reports/kpi-scorecard-detail` |
| `src/hooks/useReportAccess.ts` | Add `kpi-scorecard-detail` to `DEFAULT_CONFIGS` |
| `DOCUMENTATION.md` | v2.15.7 changelog |

### Technical Details

```text
Data flow:
  supabase.from('kpis')
    .select('id, employee_id, kra_name, kpi_name, weightage, review_period,
             review_year, status, frequency,
             kra_categories(name),
             review_submissions(self_score, manager_score, skip_level_score,
                                hr_pms_score, auditor_score, management_score,
                                final_score, is_na)')
    .eq('review_year', year)
    .range(offset, offset + 999)
  → loop until batch < 1000

  profiles: id, employee_code, full_name, designation, departments(name)
  → Map by id, join client-side
```

### Risk Assessment
- **Regression**: Zero — new page only, existing reports untouched
- **Performance**: Batch fetch proven in KPI Detail Report for 1500+ KPIs
- **Row limit**: Explicitly handled via the while-loop pattern — no 1000-row cap

