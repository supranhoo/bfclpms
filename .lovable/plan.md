

# Plan: Redesign Query Inbox for Scalability and User-Friendliness

## Problem Analysis

The current Inbox page (`QueryInbox.tsx`) has several limitations that will cause issues as data grows:

| Issue | Impact |
|-------|--------|
| **No pagination** | All notifications and queries load at once (limited to 50 notifications) |
| **No search/filter** | Cannot find specific items in large datasets |
| **Card-based layout** | Takes excessive vertical space; 10+ queries require significant scrolling |
| **Limited grouping** | Only groups by status (Open/Responded/Resolved), not by date or KPI |
| **No date-based organization** | Cannot quickly find recent vs old items |
| **No sorting options** | Cannot prioritize by age, priority, or KPI |
| **Fixed notification limit** | Hard limit of 50 in `useNotifications.ts` |
| **No "load more"** | Cannot load historical data beyond initial fetch |

---

## Solution: Enterprise-Grade Inbox Design

Transform the Inbox into a modern, Gmail-style interface with:

1. **Compact Table View** - Dense rows instead of cards for efficient scanning
2. **Filters & Search** - Find items quickly by KPI, date, status, sender
3. **Pagination/Infinite Scroll** - Load data incrementally
4. **Smart Grouping** - Group by Today, This Week, Earlier
5. **Bulk Actions** - Mark multiple as read, archive old items
6. **Quick Preview** - View details without leaving the list

---

## Visual Architecture

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│  INBOX                                                     [Mark All Read]  │
├─────────────────────────────────────────────────────────────────────────────┤
│  ┌──────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐                            │
│  │ 12   │ │    5     │ │    3     │ │    28    │                            │
│  │Unread│ │Open Query│ │ Pending  │ │ Resolved │                            │
│  └──────┘ └──────────┘ └──────────┘ └──────────┘                            │
├─────────────────────────────────────────────────────────────────────────────┤
│  Notifications │ Queries │ Sent │ Team                                      │
├─────────────────────────────────────────────────────────────────────────────┤
│  [🔍 Search...] [Status ▼] [Type ▼] [Date ▼]                [Clear Filters] │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  TODAY (3)                                                                  │
│  ├─ ● KPI Submitted - John submitted Sales Target          10:30 AM  [→]   │
│  ├─ ● Query Raised - Missing evidence for Q4...            09:15 AM  [→]   │
│  └─ ○ KPI Approved - Manager approved your KPI             08:00 AM  [→]   │
│                                                                             │
│  THIS WEEK (8)                                                              │
│  ├─ ○ Query Resolved - Response accepted                   2 days ago [→]  │
│  ├─ ○ KPI Ready for Audit - Team Lead Review               3 days ago [→]  │
│  └─ ... (5 more)                                                            │
│                                                                             │
│  EARLIER (25)                                                               │
│  └─ [Load 25 more items...]                                                 │
│                                                                             │
├─────────────────────────────────────────────────────────────────────────────┤
│  Showing 11 of 36 items                                [← Page 1 of 4 →]    │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Implementation Components

### 1. New Components to Create

| Component | Purpose |
|-----------|---------|
| `InboxFilters.tsx` | Search, status, type, and date range filters |
| `InboxTable.tsx` | Compact table view for notifications and queries |
| `InboxRowItem.tsx` | Individual row component with hover actions |
| `InboxDetailSheet.tsx` | Unified detail view for any inbox item |

### 2. Files to Modify

| File | Changes |
|------|---------|
| `src/pages/QueryInbox.tsx` | Complete refactor to use new components |
| `src/hooks/useNotifications.ts` | Add pagination, increase limit, add filters |
| `DOCUMENTATION.md` | Update with new Inbox architecture |

---

## Technical Implementation

### Phase 1: Backend/Hook Improvements

**useNotifications.ts Updates:**
- Add cursor-based pagination support
- Increase base limit from 50 to 100
- Add `loadMore` function for infinite scroll
- Add filter parameters (type, isRead, dateRange)

```typescript
// New hook signature
export function useNotifications(options?: {
  pageSize?: number;
  type?: string;
  isRead?: boolean;
}) {
  // Pagination state
  const [page, setPage] = useState(0);
  
  // Query with pagination
  const query = useQuery({
    queryKey: ['notifications', user?.id, page, options],
    queryFn: async () => {
      const query = supabase
        .from('notifications')
        .select('*', { count: 'exact' })
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .range(page * pageSize, (page + 1) * pageSize - 1);
      
      if (options?.type) query.eq('type', options.type);
      if (options?.isRead !== undefined) query.eq('is_read', options.isRead);
      
      return query;
    }
  });
  
  return { ...query, loadMore, hasMore, totalCount };
}
```

### Phase 2: Inbox Filters Component

**InboxFilters.tsx:**
- Search input with debounce
- Status dropdown (All, Unread, Read)
- Type dropdown (All, Notifications, Queries)
- Date range (Today, This Week, This Month, All Time)
- Clear filters button

```typescript
interface InboxFiltersState {
  search: string;
  readStatus: 'all' | 'unread' | 'read';
  type: 'all' | 'notification' | 'query';
  dateRange: 'today' | 'week' | 'month' | 'all';
}
```

### Phase 3: Compact Table View

**InboxTable.tsx:**
- Dense rows with hover states
- Unread indicator (blue dot)
- Type icon (notification vs query)
- Title, message preview (truncated)
- Relative timestamp
- Quick action buttons (mark read, view)

```typescript
<Table>
  <TableHeader>
    <TableRow>
      <TableHead className="w-8"></TableHead> {/* Unread indicator */}
      <TableHead className="w-8"></TableHead> {/* Type icon */}
      <TableHead>Message</TableHead>
      <TableHead className="w-24">From</TableHead>
      <TableHead className="w-32 text-right">Time</TableHead>
      <TableHead className="w-16"></TableHead> {/* Actions */}
    </TableRow>
  </TableHeader>
  <TableBody>
    {groupedItems.map(group => (
      <>
        <TableRow className="bg-muted/30">
          <TableCell colSpan={6} className="font-semibold text-xs">
            {group.label} ({group.items.length})
          </TableCell>
        </TableRow>
        {group.items.map(item => (
          <InboxRowItem key={item.id} item={item} onView={handleView} />
        ))}
      </>
    ))}
  </TableBody>
</Table>
```

### Phase 4: Date-Based Grouping

Implement smart grouping:

```typescript
function groupByDate(items: InboxItem[]): GroupedItems[] {
  const today = startOfToday();
  const weekStart = startOfWeek(today);
  
  return [
    { label: 'Today', items: items.filter(i => isToday(i.created_at)) },
    { label: 'This Week', items: items.filter(i => 
      isAfter(i.created_at, weekStart) && !isToday(i.created_at)
    )},
    { label: 'Earlier', items: items.filter(i => 
      isBefore(i.created_at, weekStart)
    )},
  ].filter(g => g.items.length > 0);
}
```

### Phase 5: Unified Detail Sheet

**InboxDetailSheet.tsx:**
- Displays full notification or query details
- For queries: shows response form, attachments, history
- For notifications: shows full message, action button
- Marks item as read on open

---

## Key Features

### 1. Search with Debounce
- Search across title, message, KPI name
- 300ms debounce to prevent excessive queries
- Highlights matching text in results

### 2. Smart Defaults
- Default view: Unread first, then by date
- Notifications tab shows notifications + queries combined (unified inbox)
- Badge counts update in real-time via subscriptions

### 3. Pagination
- Initial load: 20 items
- "Load more" button or infinite scroll
- Page size selector (10, 20, 50)
- Total count displayed

### 4. Mobile Responsiveness
- Stack filters vertically on mobile
- Swipe actions on mobile (mark read, archive)
- Collapsible date groups

### 5. Keyboard Navigation
- Arrow keys to navigate rows
- Enter to open detail
- 'R' to mark as read
- Escape to close detail

---

## Migration from Current Design

The refactor maintains backward compatibility:
- Same data sources (notifications, queries)
- Same hooks (enhanced with pagination)
- Same URL structure
- All existing functionality preserved

The change is purely UI/UX with enhanced data fetching.

---

## Testing Checklist

- [ ] Filters work correctly (search, status, type, date)
- [ ] Pagination loads more items correctly
- [ ] Unread indicators display properly
- [ ] Mark as read works (single and bulk)
- [ ] Real-time notifications appear immediately
- [ ] Query response workflow still functions
- [ ] Table is scannable with 50+ items
- [ ] Mobile layout is usable
- [ ] Performance with 100+ items is acceptable
- [ ] Date grouping is accurate

---

## Files Summary

| Action | File |
|--------|------|
| Create | `src/components/inbox/InboxFilters.tsx` |
| Create | `src/components/inbox/InboxTable.tsx` |
| Create | `src/components/inbox/InboxRowItem.tsx` |
| Create | `src/components/inbox/InboxDetailSheet.tsx` |
| Modify | `src/pages/QueryInbox.tsx` |
| Modify | `src/hooks/useNotifications.ts` |
| Modify | `DOCUMENTATION.md` |

---

## Implementation Order

1. Update `useNotifications.ts` with pagination support
2. Create `InboxFilters.tsx` component
3. Create `InboxRowItem.tsx` component
4. Create `InboxTable.tsx` with grouping logic
5. Create `InboxDetailSheet.tsx` for unified detail view
6. Refactor `QueryInbox.tsx` to use new components
7. Add date-based grouping
8. Implement search with debounce
9. Test with various data volumes
10. Update documentation

