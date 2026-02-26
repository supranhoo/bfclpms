

# Fix: Employee Performance Summary Query Timeout

## Root Cause
The Employee Performance Summary report query is failing with a **database statement timeout** (error code 57014). This happens because:

1. **Missing indexes**: The `kpis` table has no index on `review_year` or `review_period`, forcing full table scans
2. **Heavy RLS policies**: Multiple SELECT policies on `kpis` and `review_submissions` run subqueries (like `get_skip_level_manager()`) for every row, compounding the scan cost
3. The query fetches KPIs joined with review_submissions, and RLS is evaluated on both tables

## Fix (2 steps)

### Step 1: Add Database Indexes
Create a composite index on `kpis(review_year, review_period)` and an index on `kpis(employee_id)` to speed up both the filter and the RLS policy lookups.

```text
CREATE INDEX idx_kpis_review_year_period ON kpis(review_year, review_period);
CREATE INDEX idx_kpis_employee_id ON kpis(employee_id);
CREATE INDEX idx_review_submissions_kpi_id ON review_submissions(kpi_id);
CREATE INDEX idx_profiles_reporting_manager_id ON profiles(reporting_manager_id);
```

Note: `review_submissions` already has a unique index on `kpi_id`, but we'll add the others.

### Step 2: Optimize the Report Query
Restructure the query in `EmployeePerformanceSummary.tsx` to:
- Fetch KPIs and submissions in **separate queries** instead of a nested select (avoids RLS evaluation on both tables simultaneously)
- First fetch KPI IDs matching the year/period filter, then fetch submissions for those IDs
- This reduces the RLS overhead since each table's policies are evaluated independently

## Files Changed

| File | Change |
|------|--------|
| New database migration | Add indexes on `kpis` and `profiles` |
| `src/pages/reports/EmployeePerformanceSummary.tsx` | Split nested query into two separate queries to reduce RLS overhead |

## Risk Assessment

| Aspect | Risk | Mitigation |
|--------|------|------------|
| Data impact | Index-only addition, no schema changes | Indexes are non-destructive |
| Regression | None -- same data, faster queries | Query logic unchanged |
| Performance | Significant improvement expected | Composite index directly targets the filter pattern |

