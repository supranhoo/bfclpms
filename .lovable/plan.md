

# Fix: KPI Tracker Modal Shows No Data on "My KPIs" Page

## Root Cause Analysis (RCA)

The KPI Tracker Modal works on the Dashboard but shows empty chart/table on My KPIs because of a **data scope mismatch**:

| Page | KPI IDs used for submissions query | Result |
|---|---|---|
| Dashboard | ALL KPIs (no period filter) | Submissions for all months loaded -- chart works |
| My KPIs | Only current month's KPIs (period-filtered) | Only 1 month of submissions -- chart shows partial/empty data |

On the My KPIs page, `kpiIds` (line 147) is derived from `kpis` which is already filtered to the selected month/year. So `useReviewSubmissions(kpiIds)` only fetches submissions for that single period. The KPI Tracker Modal needs submissions across ALL periods to display the annual trend.

## Corrective Action (CAPA)

Add a separate `allKpiIds` variable derived from the unfiltered `allKpis` dataset, and fetch a second set of submissions (`allSubmissions`) for all periods. Pass `allSubmissions` to the KpiTrackerModal instead of the period-filtered `submissions`.

## Technical Plan

### File: `src/pages/MyKpis.tsx`

**Step 1**: Add `allKpiIds` derived from unfiltered `allKpis`:
```typescript
const allKpiIds = allKpis?.map(k => k.id) || [];
```

**Step 2**: Add a second submissions query for all periods:
```typescript
const { data: allSubmissions } = useReviewSubmissions(allKpiIds);
```

**Step 3**: Update the KpiTrackerModal to use `allSubmissions`:
```tsx
<KpiTrackerModal
  ...
  submissions={allSubmissions || []}
/>
```

The existing period-filtered `submissions` continues to be used for the rest of the page (score calculations, review forms, etc.) -- only the Tracker Modal needs the full dataset.

### File: `DOCUMENTATION.md`

Add a note about the dual-submission pattern used on My KPIs page.

## Impact

| Aspect | Detail |
|---|---|
| Files changed | 2 (MyKpis.tsx, DOCUMENTATION.md) |
| Database changes | None |
| Risk | Low -- adds one additional query; same pattern already used on Dashboard |

