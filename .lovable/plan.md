

## Make All Management Dashboard Widgets Respond to Month Selection

### Problem
When selecting a specific month (e.g., Dec) from the top month bar, the main tiles and charts update correctly, but several widgets remain static — they fetch data independently without considering the selected months.

### Widgets That Already Respond
- KPI Snapshot tiles (Total Employees, Avg Score, Completion Rate, Pending Review)
- Performance Trend chart
- Rating Distribution (Bell Curve)
- Division Performance table
- Top & Bottom Performers
- Pending Management Reviews table
- Reviewer Analytics + Manager Deviation
- Direct Reportees Monitor (has its own `selectedMonths` prop)

### Widgets That Do NOT Respond

1. **Open Queries tile** — counts ALL open queries globally (`kpi_queries` table has no `review_period` column, but links to `kpi_id` which has one). Currently uses a simple `head: true` count with no period filter.

2. **ReviewPeriodStatusWidget** — hardcoded to `currentYear`, ignores selected months entirely.

3. **RecentAuditLog** — fetches last 10 audit log entries globally, no period filter.

4. **NotificationsSummary** — fetches all notifications, no period filter.

5. **ActionItemsCards > pendingRollbacks** — `useRollbackStatusCounts` counts all pending rollbacks, no period filter.

### Changes

#### 1. `src/pages/ManagementDashboard.tsx` — Open Queries count filtered by period

Replace the simple `head: true` count with a join through `kpi_id` to filter by the selected months/years:
- Fetch open query `kpi_id`s, then cross-reference against the KPIs already fetched (which are period-filtered) to count only queries on KPIs in the selected months.
- This avoids a complex join and reuses existing data.

#### 2. `src/components/management/ReviewPeriodStatusWidget.tsx` — Accept month/year props

- Add props: `fiscalStartYear: number`, `selectedMonths: string[]`
- Filter `review_periods` query to only show periods matching the selected months and their corresponding calendar years
- Filter the KPI completion calculation to match

#### 3. `src/components/management/RecentAuditLog.tsx` — Accept month/year props

- Add props: `fiscalStartYear: number`, `selectedMonths: string[]`
- Join through `kpi_id` to filter audit logs to KPIs in the selected periods
- Alternatively, filter by `created_at` date range derived from the selected months (simpler)

#### 4. `src/components/management/NotificationsSummary.tsx` — Filter by date range

- Add props: `fiscalStartYear: number`, `selectedMonths: string[]`
- Filter notifications by `created_at` within the date range of selected months

#### 5. `src/pages/ManagementDashboard.tsx` — Pass props to child widgets

Update the render section to pass `fiscalStartYear` and `selectedMonths` to all three bottom-row widgets:
```tsx
<ReviewPeriodStatusWidget fiscalStartYear={selectedFiscalYear} selectedMonths={selectedMonths} />
<RecentAuditLog fiscalStartYear={selectedFiscalYear} selectedMonths={selectedMonths} />
<NotificationsSummary fiscalStartYear={selectedFiscalYear} selectedMonths={selectedMonths} />
```

#### 6. Open Queries — Period-aware count

In the main `queryFn`, after fetching KPIs, get open queries with their `kpi_id`, then filter to only count queries whose `kpi_id` exists in the already-fetched (period-filtered) KPI set:
```typescript
const { data: openQueryData } = await supabase
  .from('kpi_queries')
  .select('kpi_id')
  .eq('status', 'open')
  .eq('query_type', 'query');

const kpiIdSet = new Set(kpis.map(k => k.id));
const openQueries = (openQueryData || []).filter(q => kpiIdSet.has(q.kpi_id)).length;
```

### Files Modified
- `src/pages/ManagementDashboard.tsx` — pass props + fix open queries count
- `src/components/management/ReviewPeriodStatusWidget.tsx` — accept and use month filters
- `src/components/management/RecentAuditLog.tsx` — accept and use month/date filters
- `src/components/management/NotificationsSummary.tsx` — accept and use date filters

### No database changes needed

