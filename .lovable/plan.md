

## Add Status Toggle and Status Filter for Notifications

### What the user wants
1. **Clickable status badge** on each notification row to toggle between Read/Unread
2. **Status filter** visible on the notifications tab (already exists as readStatus dropdown -- need to verify it's working)

### Current state
- The readStatus filter dropdown already exists in `InboxFilters.tsx` and shows for `isNotificationTab` (lines 91-106) with All/Unread/Read options
- The `usePaginatedNotifications` hook already applies readStatus server-side (lines 72-76)
- `onMarkRead` prop exists on `InboxRowItem` but only marks as **read** (no toggle to unread)
- The status badge we added shows Read/Unread but is not clickable

### Changes

**File 1: `src/components/inbox/InboxRowItem.tsx`**
- Make the Read/Unread badge clickable to toggle status
- Add `onToggleRead` prop (or reuse `onMarkRead` with toggle behavior)
- Replace the static badge with a clickable button-badge that calls `onMarkRead` to toggle

```tsx
{item.type === 'notification' && (
  <Badge
    variant="outline"
    className={cn('text-xs cursor-pointer hover:bg-muted transition-colors',
      item.isRead ? 'text-muted-foreground' : 'text-primary border-primary')}
    onClick={(e) => {
      e.stopPropagation();
      onMarkRead?.(item);
    }}
  >
    {item.isRead ? 'Read' : 'Unread'}
  </Badge>
)}
```

**File 2: `src/hooks/usePaginatedNotifications.ts`**
- Update `useMarkNotificationRead` mutation to support toggling (set `is_read` to the opposite of current value, or accept a target value)
- Add a `useToggleNotificationRead` hook or modify existing `useMarkNotificationRead` to accept a boolean parameter

**File 3: `src/pages/QueryInbox.tsx`**
- Update the `onMarkRead` handler to toggle instead of only marking read
- Ensure it works with the updated mutation

### Summary
Two functional additions: (1) clicking the status badge toggles read/unread state, (2) the existing read/unread filter dropdown (already present) correctly filters results. One small hook update + one UI interaction change.

