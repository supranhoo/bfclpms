

# Fix: Inbox Intermittently Showing "No Notifications Yet"

## Problem
When filters change (tab switch, date range, etc.), there's a brief flash where all items disappear and "No Notification yet" is shown, even when data exists. This is a race condition between state clearing and data refetching.

## Root Cause
In `usePaginatedNotifications.ts`, when filters change:
1. A `useEffect` immediately calls `setAllItems([])` -- wiping visible data
2. React Query starts refetching, but `isLoading` stays `false` (it's only `true` on first-ever fetch)
3. The component renders with empty items and no loading state -- showing "No notifications yet"
4. Data arrives a moment later and items reappear

## Fix (2 small changes)

### Change 1: `src/hooks/usePaginatedNotifications.ts`
Remove `setAllItems([])` from the filter-reset effect. The accumulation effect already replaces all items when `page === 0`, so clearing them early just creates the empty flash.

Before:
```typescript
useEffect(() => {
  setPage(0);
  setAllItems([]);  // <-- causes the flash
}, [filters.search, filters.readStatus, filters.type, filters.dateRange]);
```

After:
```typescript
useEffect(() => {
  setPage(0);
  // Don't clear allItems here -- the accumulation effect
  // replaces them when page === 0 and new data arrives
}, [filters.search, filters.readStatus, filters.type, filters.dateRange]);
```

Also update the loading state to include the refetch-after-reset scenario:
```typescript
return {
  notifications: allItems,
  isLoading: query.isLoading,
  isFetching: query.isFetching,
  isRefetching: query.isRefetching,  // new: expose refetch state
  ...
};
```

### Change 2: `src/pages/QueryInbox.tsx`
Fix the loading guard from `&&` to `||` so the skeleton shows when *either* data source is loading:

Before:
```typescript
if (loadingQueries && loadingNotifications) {
```

After:
```typescript
if (loadingQueries || loadingNotifications) {
```

## Impact
- No more "No notifications yet" flash when switching filters or tabs
- Data stays visible until replaced by new results (like Gmail/Outlook behavior)
- Loading skeleton shows correctly during initial data fetch

## Files Changed
| File | Change |
|------|--------|
| `src/hooks/usePaginatedNotifications.ts` | Remove eager `setAllItems([])` on filter change |
| `src/pages/QueryInbox.tsx` | Fix loading guard from `&&` to `\|\|` |
| `DOCUMENTATION.md` | Note the fix |

