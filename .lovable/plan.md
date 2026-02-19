
# Fix: Admin KPI Dashboard — Real-Time Updates & KPI Sort Order Stability

## Two Issues Identified

---

## Issue 1: Dashboard Not Updating in Real-Time

### Root Cause
The `useAdminSubmitReviewData` mutation in `src/hooks/useAdminDataEntry.ts` (line 246) only invalidates these query keys on success:
- `['review-submission-admin']`
- `['review-submissions']`
- `['kpis']`
- `['all-kpis']`

It is **missing** invalidation for `['kpis-by-period']`, which is the **primary query key used by the Admin KPI Dashboard** (`AllKpis.tsx` line 81–84). When the page has a specific month/year selected (the default behavior), it uses `useKpisByPeriod` → query key `['kpis-by-period', selectedPeriod, selectedYear]`. Without invalidating this key, the cache stays stale after any admin action and the dashboard only refreshes on the next page visit or manual refresh.

The same gap exists in `useAdminStatusStepBack` (lines 433+) — its `onSuccess` also does not invalidate `['kpis-by-period']`.

### Fix
In `src/hooks/useAdminDataEntry.ts`:

1. In `useAdminSubmitReviewData` → `onSuccess`: add `queryClient.invalidateQueries({ queryKey: ['kpis-by-period'] })`
2. In `useAdminSubmitSubPeriod` → `onSuccess`: add `queryClient.invalidateQueries({ queryKey: ['kpis-by-period'] })`
3. In `useAdminStatusStepBack` → `onSuccess`: add `queryClient.invalidateQueries({ queryKey: ['kpis-by-period'] })`

Also, the `useAdminUpdateKpi` mutation in `src/hooks/useKpis.ts` (line 490) is also missing `['kpis-by-period']` invalidation. Fix this too.

---

## Issue 2: "Individual KPIs" Sequence Changes on Every Refresh

### Root Cause
When an employee row is expanded in the table, the KPIs for that employee are retrieved by `getEmployeeKpis()` (line 216), which filters `filteredKpis`. The `filteredKpis` list is derived from `kpis`, which is fetched with:

```
.order('created_at', { ascending: false })
```

This returns KPIs ordered by creation timestamp descending. The problem is that **when an admin mutation runs** (e.g., data entry, status change), the `updated_at` field is written, and after cache invalidation + refetch, if there is any ambiguity in the server sort (two KPIs with the same `created_at`, or the server returns them in a slightly different order due to row-level locking state), the order can fluctuate.

More critically: the `employeeKpis` list rendered in the expanded panel has **no secondary sort applied** — it simply follows whatever order they appear in `filteredKpis`, which changes based on the server's response order.

### Fix
In `src/pages/admin/AllKpis.tsx`, stabilize the `getEmployeeKpis` function (line 216) by adding a **deterministic secondary sort** to the returned employee KPIs — sort by `kra_name` ascending, then by `kpi_name` ascending. This is alphabetical and stable across refetches:

```ts
const getEmployeeKpis = useCallback((employeeId: string): KPI[] => {
  return filteredKpis
    ?.filter(k => {
      const emp = k.profiles as { id: string } | null;
      return emp?.id === employeeId;
    })
    .sort((a, b) => {
      const kraCompare = (a.kra_name || '').localeCompare(b.kra_name || '');
      if (kraCompare !== 0) return kraCompare;
      return (a.kpi_name || '').localeCompare(b.kpi_name || '');
    }) || [];
}, [filteredKpis]);
```

Additionally, add a secondary sort key to the `useKpisByPeriod` query in `src/hooks/useKpis.ts` (line 187):
- Change `.order('created_at', { ascending: false })` to include a secondary `.order('id', { ascending: true })` to make the Supabase response deterministic even when `created_at` values collide.

---

## Files to Modify

| File | Change |
|---|---|
| `src/hooks/useAdminDataEntry.ts` | Add `['kpis-by-period']` invalidation in 3 mutation `onSuccess` handlers |
| `src/hooks/useKpis.ts` | Add `['kpis-by-period']` invalidation in `useAdminUpdateKpi` onSuccess; add secondary `.order('id')` to `useKpisByPeriod` query |
| `src/pages/admin/AllKpis.tsx` | Add stable sort (by `kra_name`, then `kpi_name`) inside `getEmployeeKpis` callback |
| `DOCUMENTATION.md` | Version bump to 1.45.27 |

## Expected Outcome

- After any admin data entry, status step-back, or KPI update — the dashboard stats cards, stage counts, and employee rows all update immediately without requiring a manual refresh.
- The "Individual KPIs" list within any expanded employee row will always appear in the same alphabetical order (by KRA name, then KPI name), regardless of how many times the page refreshes or mutations fire.
