

## Plan: Optimize Cloud Billing — Reduce Polling, Merge Channels, Add Page Guards

### Problem
Four concurrent realtime channels per session + aggressive 30s polling across all pages are driving unnecessary Cloud compute and bandwidth costs.

### Changes

| # | File | Change |
|---|------|--------|
| 1 | `src/hooks/useNotifications.ts` | Increase `refetchInterval` from 30s → 120s in `useUnreadNotificationCount` |
| 2 | `src/hooks/useOpenQueryCount.ts` | Increase `refetchInterval` from 30s → 120s |
| 3 | `src/hooks/usePaginatedNotifications.ts` | Remove the duplicate `notifications-paginated-realtime` channel subscription entirely — the `useNotifications.ts` channel already handles invalidation of the same query keys |
| 4 | `src/hooks/useNotifications.ts` | Expand the existing `notifications-realtime` channel handler to also invalidate `paginated-notifications` query key (replacing the removed channel) |
| 5 | `src/hooks/useRealtimeKpiSync.ts` | Accept an optional `enabled` parameter (default `true`). When `false`, skip channel subscription. |
| 6 | `src/components/layout/DashboardLayout.tsx` | No change needed — `useRealtimeKpiSync` stays global since KPI data is used across most pages |
| 7 | `src/hooks/useOpenQueryCount.ts` | Add `refetchOnWindowFocus: true` to compensate for the longer polling interval — users get fresh data when they tab back |
| 8 | `src/hooks/useNotifications.ts` | Add `refetchOnWindowFocus: true` to `useUnreadNotificationCount` for the same reason |
| 9 | `DOCUMENTATION.md` | Document optimization changes |
| 10 | `POLICY.md` | Version sync |

### Technical Detail

**Polling interval changes** — Simple constant updates:
```typescript
// useNotifications.ts & useOpenQueryCount.ts
refetchInterval: 120_000, // Was 30_000
refetchOnWindowFocus: true,
```

**Channel merge** — Remove the entire `useEffect` block in `usePaginatedNotifications.ts` (lines ~140-165) that creates the `notifications-paginated-realtime` channel. Update the existing channel in `useNotifications.ts` to also invalidate paginated queries:
```typescript
// In useNotifications.ts realtime handler
queryClient.invalidateQueries({ queryKey: ['notifications', user.id] });
queryClient.invalidateQueries({ queryKey: ['unread-notification-count', user.id] });
queryClient.invalidateQueries({ queryKey: ['paginated-notifications', user.id] });
```

### Impact Summary
- **Channels per session**: 4 → 3 (one duplicate removed)
- **Polling queries**: ~4 queries/min → ~1 query/min per hook (4x reduction)
- **Data freshness**: Realtime still provides instant notification delivery; polling is backup only. Window focus refetch ensures stale tabs catch up immediately.

### Risk Assessment
- **Data impact**: None — read-only polling changes
- **Regression risk**: Low — realtime still handles instant updates; polling is just a fallback
- **UX impact**: Negligible — users see new notifications via realtime instantly; the 120s interval only matters if the WebSocket drops

