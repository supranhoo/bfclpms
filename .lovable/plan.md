

# RCA and CAPA: Send-Back KPI Not Updating Status Without Page Refresh

## Root Cause Analysis

### Problem
After Jaspal sends back Purnima's KPI, the KPI still appears as "reviewable" in the scorecard until the page is manually refreshed.

### Root Cause: Missing cache invalidation for `kpis-by-period` query

The send-back mutation in `UnifiedScorecard.tsx` (line 494-498) invalidates these query keys on success:

```text
queryClient.invalidateQueries({ queryKey: ['kpis'] });
queryClient.invalidateQueries({ queryKey: ['review-submissions'] });
```

However, the **EmployeeSelectorGrid** (the parent employee list with pending/reviewed counts) uses a DIFFERENT query:

```text
useKpisByPeriod() -> queryKey: ['kpis-by-period', period, year]
```

TanStack Query's `invalidateQueries({ queryKey: ['kpis'] })` matches keys that START with `['kpis']` -- for example `['kpis', employeeId]`. But `['kpis-by-period', ...]` does NOT match because `'kpis-by-period'` is not equal to `'kpis'`.

| Query | Key | Invalidated? |
|---|---|---|
| `useKpisByEmployee` (scorecard) | `['kpis', employeeId]` | Yes |
| `useKpisByPeriod` (employee grid) | `['kpis-by-period', period, year]` | **No** |

This means:
1. The scorecard's own KPI list does refetch (status updates in the KPI table)
2. But the employee grid's pending badge counts stay stale
3. And if the reviewer navigates back to the grid, the employee still shows old pending counts

### Secondary Issue
After the send-back succeeds, the send-back dialog closes but the review sheet stays open on the same KPI. The KPI's `isReviewable()` check should now return false (status changed), but the reviewer sees no visual feedback that the action completed beyond the toast message.

---

## CAPA (Corrective and Preventive Action)

### Fix 1: Add missing cache invalidation keys

**File: `src/components/review/UnifiedScorecard.tsx`**

Add `kpis-by-period` to the send-back mutation's `onSuccess` handler so the employee grid refreshes:

```text
onSuccess: () => {
  queryClient.invalidateQueries({ queryKey: ['kpis'] });
  queryClient.invalidateQueries({ queryKey: ['kpis-by-period'] });  // NEW
  queryClient.invalidateQueries({ queryKey: ['review-submissions'] });
  ...
}
```

Also apply the same fix to the `useSendBackKpi` hook in `useKpis.ts` (used by `EmployeeScorecard`).

### Fix 2: Close review sheet after successful send-back

After the send-back succeeds, automatically close the review sheet so the reviewer returns to the updated KPI list. This provides clear visual feedback that the action completed.

```text
onSuccess: () => {
  ...
  setSendBackDialogOpen(false);
  setReviewSheetOpen(false);  // NEW - close the review sheet too
}
```

### Fix 3: Audit all other mutations for the same gap

Check `approveKpi` and `handleSubmitReview` for the same missing `kpis-by-period` invalidation and add it where needed.

### Files to Modify

| File | Change |
|---|---|
| `src/components/review/UnifiedScorecard.tsx` | Add `kpis-by-period` invalidation to send-back, approve, and submit mutations. Close review sheet on send-back success. |
| `src/hooks/useKpis.ts` | Add `kpis-by-period` invalidation to `useSendBackKpi` and `useApproveKpi` hooks. |
| `DOCUMENTATION.md` | Document cache invalidation requirements for workflow mutations. |

### Risk

Very Low -- adding extra invalidation keys only causes additional refetches (ensuring fresh data). No business logic changes.
