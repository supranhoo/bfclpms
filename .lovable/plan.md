

## Fix: Show Status in Notification Rows

### Problem
The table has a "Status" column header, but `InboxRowItem.tsx` only renders a badge for query items (`item.type === 'query'`). For notification items, the cell is always blank, making it appear nonfunctional.

### Fix

**File: `src/components/inbox/InboxRowItem.tsx` (Status Badge cell, ~lines 98-107)**

Add a read/unread badge for notification items alongside the existing query status badge:

```tsx
{/* Status Badge */}
<TableCell className="w-28 hidden md:table-cell">
  {item.type === 'query' && item.queryStatus && (
    <Badge variant="outline" className={cn('text-xs', getQueryStatusClasses(item.queryStatus))}>
      {item.queryStatus === 'open' && 'Open'}
      {item.queryStatus === 'responded' && 'Responded'}
      {item.queryStatus === 'resolved' && 'Resolved'}
    </Badge>
  )}
  {item.type === 'notification' && (
    <Badge variant="outline" className={cn('text-xs', item.isRead ? 'text-muted-foreground' : 'text-primary border-primary')}>
      {item.isRead ? 'Read' : 'Unread'}
    </Badge>
  )}
</TableCell>
```

One file, one cell update. The read/unread filter already works server-side via `usePaginatedNotifications` -- this just makes the status visible in the table.

