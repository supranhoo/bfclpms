

## Add Manager vs. HR PMS / Auditor Deviation Widget

### Problem
The existing "Reviewer Analytics — Score Bias" shows manager scoring deviation from the org mean. The user wants a companion widget showing how each manager's scores deviate from HR PMS and Auditor ratings, to identify managers who aren't reviewing KPIs properly (rubber-stamping or over/under-scoring compared to independent reviewers).

### Changes

#### 1. New component: `src/components/management/ManagerReviewDeviationTable.tsx`

A card similar to `ReviewerAnalyticsTable` with columns:
- **Manager** — name
- **Avg Mgr Score** — manager's average score (as %)
- **vs HR PMS** — deviation from avg HR PMS score for same KPIs (badge, red if >10%)
- **vs Auditor** — deviation from avg Auditor score for same KPIs (badge, red if >10%)
- **# KPIs** — number of KPIs compared

Title: "Manager vs. Reviewer Deviation". Description: "How manager scores compare to HR PMS & Auditor ratings on the same KPIs".

#### 2. Data computation in `src/pages/ManagementDashboard.tsx` (~line 409-439)

After the existing reviewer analytics block, add a new computation:

- For each KPI with a `manager_score`, also check if `hr_pms_score` and/or `auditor_score` exist.
- Group by reporting manager ID. For each manager, accumulate:
  - `mgrTotal`, `mgrCount` (manager scores)
  - `hrPmsTotal`, `hrPmsCount` (HR PMS scores on same KPIs)
  - `auditorTotal`, `auditorCount` (Auditor scores on same KPIs)
- Compute averages and deviations: `avgMgr - avgHrPms` and `avgMgr - avgAuditor`.
- Filter to managers with at least 3 comparable KPIs.
- Sort by largest absolute deviation (max of hr_pms or auditor deviation).
- Return as `managerReviewDeviation` in dashboard data.

#### 3. Layout in `src/pages/ManagementDashboard.tsx` (~line 873-883)

Change the grid from 2-col (`ReviewerAnalyticsTable` + `TrainingGapSummary`) to 3-col:
```
[Reviewer Analytics — Score Bias] [Manager vs. Reviewer Deviation] [Training Gap Summary]
```

On smaller screens, stack naturally via `lg:grid-cols-3`.

### No database changes needed
All `manager_score`, `hr_pms_score`, and `auditor_score` fields are already fetched in the dashboard query's `review_submissions` select.

