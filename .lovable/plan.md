

## Fix: Inbox Arrow Button Should Navigate Directly to KPI Page

### Problem
The ExternalLink (arrow) button in each inbox row calls `onView(item)` — which opens the detail sheet. Users expect this button to navigate directly to the relevant KPI details page, not open the detail sheet.

### Root Cause
`InboxRowItem.tsx` line 184-194: The ExternalLink button's `onClick` calls `onView(item)` (detail sheet), ignoring the `onNavigate` prop entirely. The `onNavigate` prop is accepted but never used in the component.

### Changes

#### `src/components/inbox/InboxRowItem.tsx` (line 184-194)

Change the ExternalLink button to:
1. Import `getNotificationNavigationPath` from `inboxUtils`
2. Compute the navigation path for the item
3. If a path exists, call `onNavigate(path)` directly (also mark as read)
4. If no path exists (e.g. query items), fall back to `onView(item)` to open the detail sheet

```typescript
// In the ExternalLink button onClick:
const path = getNotificationNavigationPath(item, currentUserId);
if (path && onNavigate) {
  if (!item.isRead && onMarkRead) onMarkRead(item);
  onNavigate(path);
} else {
  onView(item);
}
```

The row click (`handleRowClick`) continues to open the detail sheet as before — only the arrow button behavior changes.

### Files Modified
- `src/components/inbox/InboxRowItem.tsx` — arrow button navigates directly to KPI page

