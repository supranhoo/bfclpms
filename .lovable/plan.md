

## Fix: Stale `final_score` in Fallback Chains Across Codebase

### Problem
The same bug exists in **9 other files**. They all use a fallback chain like:
```
final_score ?? management_score ?? auditor_score ?? manager_score ?? self_score
```
This picks up the stale `final_score` (e.g. 5 from import) even when the KPI is not yet approved and later reviewers scored 0.

### Fix Pattern
In every fallback chain, only use `final_score` when the KPI status is `'approved'`. Otherwise, skip it:
```typescript
// Before:
const score = sub.final_score ?? sub.management_score ?? ...

// After:
const score = (status === 'approved' ? sub.final_score : null) ?? sub.management_score ?? ...
```

### Files to Change

| # | File | Line(s) | Context |
|---|------|---------|---------|
| 1 | `src/components/management/DirectReporteesMonitor.tsx` | 88 | Monthly score aggregation — has `kpi.status` available via `allKpis` query (needs adding to select) |
| 2 | `src/pages/ManagementDashboard.tsx` | 217 | Dashboard score calc — has `kpi.status` available |
| 3 | `src/pages/reports/PerformanceReport.tsx` | 54, 73 | Category scores and avg — has `kpi.status` available |
| 4 | `src/pages/reports/EmployeePerformanceSummary.tsx` | 180, 288 | Two fallback chains — has `kpi.status` available |
| 5 | `src/pages/reports/KpiDetailReport.tsx` | 26-37 | `resolveFinalScore()` helper — needs status param added |
| 6 | `src/components/review/KpiHistoryCard.tsx` | 47 | History chart score — has `k.status` available |
| 7 | `src/components/review/KpiReviewPanel.tsx` | 96 | `baseScore` prop — has `kpi.status` available |
| 8 | `src/components/dashboard/KpiTrackerModal.tsx` | 142 | Monthly detail `finalScore` — has `k.status` available; guard display same as KpiDetailsTable |
| 9 | `src/pages/admin/ImportData.tsx` | 1744-1746 | Export rating column — has KPI status from joined data |

### Approach
- Each file already has access to the KPI status (either directly or via joined data)
- The fix is mechanical: wrap `final_score` access with a status check
- `KpiDetailReport.resolveFinalScore` will gain an optional `status` parameter
- `DirectReporteesMonitor` needs `status` added to its Supabase select query

### Impact
- Immediately fixes stale scores for all existing data across dashboards, reports, and review panels
- Combined with the previous fixes (clearing final_score on intermediate review, guarding imports), this eliminates the issue end-to-end

