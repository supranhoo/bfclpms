

## Apply Overdue Due-Date Filter Across Management Dashboard

### Problem
The Management Dashboard counts and displays ALL pending KPIs regardless of whether they are actually overdue. The frequency-based due date logic (already implemented in the Bottleneck Report) needs to be applied everywhere pending KPIs are counted or listed.

### Due Date Rule (recap)
- Monthly/Daily/Weekly: 1st of next month
- Bi-Monthly: 1st of month after cycle end
- Quarterly: 1st of month after quarter end
- Half-Yearly/Yearly: 1st of month after period end

Only KPIs where `today >= dueDate` are considered "pending/overdue".

### Changes

#### 1. Extract `getKpiDueDate` to shared utility
**File: `src/lib/frequencyUtils.ts`**
- Move the `getKpiDueDate` function from `src/hooks/useBottleneckReport.ts` to `src/lib/frequencyUtils.ts` so it can be reused.

**File: `src/hooks/useBottleneckReport.ts`**
- Remove the local `getKpiDueDate` and import it from `@/lib/frequencyUtils`.

#### 2. Apply overdue filter in Management Dashboard
**File: `src/pages/ManagementDashboard.tsx`**

The KPI query (line 182) needs `frequency` added to the select. Then apply the overdue filter at these points:

1. **Add `frequency` to KPI select** (line 182): Add `frequency` to the query fields.

2. **Import `getKpiDueDate`** from `@/lib/frequencyUtils`.

3. **`overdueReviews` calculation (lines 431-433)**: Replace current logic with frequency-aware due date check — only count non-approved KPIs where `today >= getKpiDueDate(kpi.frequency, kpi.review_period, kpi.review_year)`.

4. **`managementPendingKpis` (line 266)**: Add overdue filter — only include `management_review` KPIs that are past their due date.

5. **`pendingReviews` table (line 276)**: Automatically fixed since it's derived from `managementPendingKpis`.

6. **`managementPending` in `calculateMetrics` (line 230)**: Add overdue filter to the management_review count.

7. **`divisionPerformance.pendingReviews` (line 298)**: Add overdue filter to the per-division management_review count.

### No database changes needed

