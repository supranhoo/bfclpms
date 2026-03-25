

## Fix: Notification Type Filter Not Applied

### Problem
In `src/pages/QueryInbox.tsx` (lines 93-97), the `notificationFilters` memo only passes `search`, `readStatus`, and `dateRange` to `usePaginatedNotifications`. The `notificationType` value from the filter UI is never forwarded, so selecting "@Mentioned" or any type has no effect.

The hook (`usePaginatedNotifications`) already supports a `type` filter field (lines 78-80) — it just never receives the value.

### Fix

**File: `src/pages/QueryInbox.tsx` (lines 93-97)**

Add the `type` field mapped from `filters.notificationType`:

```typescript
const notificationFilters: NotificationFilters = useMemo(() => ({
  search: filters.search,
  readStatus: filters.readStatus,
  dateRange: filters.dateRange,
  type: filters.notificationType,
}), [filters]);
```

One line addition. No other files need changes.

