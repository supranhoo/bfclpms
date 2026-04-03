

## Why the Audit Logs Page Shows 0 Results

**Root Cause**: The page fetches only 500 most recent logs from the database with **no server-side period filter**, then filters by review period/year **client-side**. There are 24,113 total audit logs and 11,054 for February 2026 alone. The top 500 logs are likely all from April 2026, so after client-side filtering for February, nothing matches — hence all zeros.

Additionally, the `queryKey` is hardcoded as `['audit-logs']` and doesn't include `selectedPeriod` or `selectedYear`, so changing the period selector never triggers a refetch.

## Fix

### 1. Add Server-Side Period Filtering (src/pages/AuditLogs.tsx)

- Change the Supabase query to use an `!inner` join on `kpis` to filter by `review_period` and `review_year` at the database level:
  ```
  .from('kpi_audit_logs')
  .select(`..., kpi:kpi_id!inner(...)`)
  .eq('kpi.review_period', selectedPeriod)
  .eq('kpi.review_year', selectedYear)
  ```
- Include `selectedPeriod` and `selectedYear` in the `queryKey` so React Query refetches when filters change.
- Remove the redundant client-side period/year filter from `filteredLogs`.

### 2. Increase or Paginate the Limit

- Raise `.limit(500)` to `.limit(1000)` or add pagination for large result sets.

### Files Modified

| File | Change |
|------|--------|
| `src/pages/AuditLogs.tsx` | Server-side filtering via `!inner` join, fix queryKey, remove client-side period filter |
| `DOCUMENTATION.md` | Version bump with fix note |

### Risk Assessment
- **Low risk**: Read-only query change; no schema or RLS modifications.
- The `!inner` join ensures only logs linked to KPIs matching the selected period are returned, which is the intended behavior.

