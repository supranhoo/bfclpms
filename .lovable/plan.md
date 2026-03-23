
RCA found a real bug I missed earlier.

## Root cause

Employee `100840` does have valid scores for Sep–Dec in the database, and the main dashboard calculation also resolves them correctly. The reason they disappear in **Direct Reportees — Score Trend** is:

- `DirectReporteesMonitor.tsx` fetches KPIs with:
  - year filter
  - month filter
  - employee_id batch filter
- but it does **not paginate** the KPI query
- backend queries default to **1000 rows max**

For this manager/team:
- **Sep–Dec 2025** KPI rows = **1199**
- **Jan–Feb 2026** KPI rows = **654**

So the widget silently receives only the first 1000 rows for Sep–Dec. Employees whose KPI rows fall after that cutoff lose some or all month data. That is why `100840` can show scores on the dashboard but appear blank in the trend widget. The screenshot pattern also matches this: later months with fewer rows still appear, while earlier overloaded months can be blank.

## Evidence

For employee `100840`:
- Sep 2025 weighted avg = **3.15**
- Oct 2025 weighted avg = **3.2703**
- Nov 2025 weighted avg = **3.4211**
- Dec 2025 weighted avg = **3.6842**

So the data exists and is scoreable. The bug is fetch truncation.

## What to change

### 1. Fix KPI fetching in `src/components/management/DirectReporteesMonitor.tsx`
Replace the single KPI fetch per year/month/idBatch with paginated fetching using `.range(offset, offset + batchSize - 1)` inside a loop, same pattern already used in `ManagementDashboard.tsx`.

Implementation shape:
- keep employee batching
- for each `(calendarYear, months, idBatch)`:
  - fetch in pages of 1000
  - append all pages into `allKpis`
  - stop when returned rows `< batchSize`

This removes silent truncation for large teams or large month selections.

### 2. Keep current scoring logic
No scoring formula change is needed for this specific issue:
- employee scores exist
- fallback chain is now aligned
- N/A handling is already correct in this widget

### 3. Add a defensive comment / helper
Create a small helper inside the component (or shared util later) for paged KPI fetches so this limit is not reintroduced during future edits.

## Additional bug now confirmed

This means the earlier “all bugs” review missed a key high-impact defect:

- **Missing pagination for KPI fetch in Direct Reportees monitor**
  - Severity: High
  - Effect: employees randomly lose month scores when row count exceeds 1000
  - Scope: any manager/team/month selection with large result sets

## Concise implementation plan

1. Update `DirectReporteesMonitor.tsx` KPI query to paginate with `.range(...)`.
2. Preserve current employee batching and merge all pages before aggregation.
3. Verify month scores for employee `100840` now appear for Sep–Dec.
4. Spot-check a few other employees/managers to confirm no more silent blanks under heavy datasets.

## Technical note

Current buggy pattern:
```ts
.from('kpis')
.select(...)
.eq('review_year', calYear)
.in('review_period', months)
.in('employee_id', idBatch)
```

Required fix pattern:
```ts
let offset = 0;
const batchSize = 1000;
let hasMore = true;

while (hasMore) {
  const { data, error } = await supabase
    .from('kpis')
    .select(...)
    .eq('review_year', calYear)
    .in('review_period', months)
    .in('employee_id', idBatch)
    .range(offset, offset + batchSize - 1);

  if (error) throw error;
  if (data?.length) {
    allKpis.push(...data);
    offset += batchSize;
    hasMore = data.length === batchSize;
  } else {
    hasMore = false;
  }
}
```
