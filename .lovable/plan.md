

# Fix: Review Submissions Query URL Too Long (400 Bad Request)

## Root Cause
The optimized query splits KPIs and submissions into separate fetches, but uses the same `batchSize = 1000` for the `.in('kpi_id', batch)` call. Each UUID is 36 characters, so 1000 UUIDs create a URL of ~40,000+ characters, exceeding the HTTP URL length limit. The server returns **400 Bad Request**.

## Fix

### File: `src/pages/reports/EmployeePerformanceSummary.tsx`

Reduce the batch size for `.in()` queries from 1000 to **300** (safe URL length). This applies to:

1. **Main data fetch** (around line 130): The submission fetch loop uses `batchSize` (1000) -- change to a smaller `inBatchSize = 300`
2. **Trend data fetch** (around line 257): Same issue in the period comparison query

The KPI fetch itself (using `.range()`) can stay at 1000 since that uses pagination, not URL params.

## Technical Detail
- KPI fetch: keep `batchSize = 1000` (uses offset/limit pagination -- fine)
- Submission `.in()` fetch: use `inBatchSize = 300` (~300 x 40 chars = ~12,000 chars -- safe)

## Risk Assessment

| Aspect | Risk | Mitigation |
|--------|------|------------|
| Data | None -- same data fetched | Just more HTTP round trips |
| Performance | Slightly more requests (4 instead of 1-2) | Still much faster than timeout |
| Regression | None | Logic unchanged |

