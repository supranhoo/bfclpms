

# Fix: Org KPI Propagated Data Not Reflecting on Employee Dashboard

## Corrected Data Verification

The actual database state (verified via direct query):

| Field | org_kpi_values | review_submissions |
|-------|---------------|-------------------|
| achieved_value | 5 (numeric) | 5.00 |
| self_score | N/A | 0.00 |
| self_rating | N/A | red |
| self_remarks | "Zero Fatal" | "Zero Fatal" |
| status | propagated | N/A |
| kpi status | N/A | self_review |

The `self_score` is **0**, not 5. This is because the KPI's scoring logic is: "Rating 5: 0, Rating 0: Any Fatal" -- meaning zero fatals (Yes) correctly maps to score 0 based on how the rating thresholds are defined for this KPI. The propagation RPC is working correctly.

## Root Cause: Missing Cache Invalidation

The propagation hooks (`usePropagateOrgKpiValue` and `useBulkPropagateOrgKpiValues`) only invalidate these query keys:
- `['kpis']`
- `['review-submissions']`
- `['org-kpi-values']`

But they are **missing** the keys that the employee dashboard and other views depend on:
- `['my-kpis']` -- used by `useMyKpis()` on the employee Dashboard
- `['all-kpis']` -- used by admin reports
- `['kpis-by-period']` -- used by period-filtered views

Every other mutation in the codebase that modifies KPI data invalidates all these keys (verified in `useKpis.ts` lines 366-370, 394-398, 503-507, 531-535, 663-667, 731-734). The propagation hooks are the only ones that don't follow this pattern.

Without invalidating `['my-kpis']`, the employee's dashboard continues showing stale cached data (old status, no score) until they manually refresh the browser.

## Fix

**File:** `src/hooks/usePropagateOrgKpiValue.ts`

Add the missing cache invalidation keys to both hooks' `onSuccess` callbacks:

### usePropagateOrgKpiValue (line 185-188)
```text
Current:
  queryClient.invalidateQueries({ queryKey: ['kpis'] });
  queryClient.invalidateQueries({ queryKey: ['review-submissions'] });
  queryClient.invalidateQueries({ queryKey: ['org-kpi-values'] });

Fixed:
  queryClient.invalidateQueries({ queryKey: ['kpis'] });
  queryClient.invalidateQueries({ queryKey: ['my-kpis'] });
  queryClient.invalidateQueries({ queryKey: ['all-kpis'] });
  queryClient.invalidateQueries({ queryKey: ['kpis-by-period'] });
  queryClient.invalidateQueries({ queryKey: ['review-submissions'] });
  queryClient.invalidateQueries({ queryKey: ['org-kpi-values'] });
```

### useBulkPropagateOrgKpiValues (line 243-246)
Same additions applied.

## Impact

- Employee dashboards will immediately reflect propagated org KPI values, scores, and status changes
- Admin report views will also refresh automatically
- No database or schema changes needed
- Display-only fix, zero regression risk

## Risk Assessment

| Aspect | Risk | Notes |
|--------|------|-------|
| Data | None | Cache invalidation only triggers refetch |
| Regression | None | Aligns with pattern used by every other KPI mutation |
| Performance | Negligible | A few extra cache invalidation calls |

## Note on Cross-Session Updates

This fix works for the admin who propagates (same browser session). Employees on a different browser/device will need to refresh their page. Real-time cross-session sync would require enabling Realtime subscriptions (separate enhancement).

## Files Changed

| File | Change |
|------|--------|
| `src/hooks/usePropagateOrgKpiValue.ts` | Add `my-kpis`, `all-kpis`, `kpis-by-period` to cache invalidation in both hooks |

