

## Add "Read" Tab to Inbox — Show Only Unread in Notifications Tab

### What changes

The Notifications tab currently shows all notifications (read + unread). The user wants:
- **Notifications tab**: Show only **unread** notifications by default
- **New "Read" tab**: Shows previously-read notifications

### Implementation

**1. `src/pages/QueryInbox.tsx`**
- Update `activeTab` type to include `'read'`
- Change the default `notificationFilters` to force `readStatus: 'unread'` when on the Notifications tab
- Add a second `usePaginatedNotifications` call with `readStatus: 'read'` for the Read tab
- Add a new `TabsTrigger` for "Read" (with a `CheckCheck` icon) between Notifications and Queries
- Add a new `TabsContent` for the Read tab rendering an `InboxTable` with read items
- Update the Notifications tab badge to show unread count (already does this)
- Add a count badge on the Read tab showing total read notifications

**2. `src/pages/QueryInbox.tsx` — filter wiring**
- The existing `notificationFilters` memo builds from `filters.readStatus`. Override this so the Notifications tab always queries `readStatus: 'unread'` and the Read tab always queries `readStatus: 'read'`, regardless of the dropdown filter
- Keep the read-status dropdown filter hidden/removed from the Notifications and Read tabs since it's now implicit

**3. `src/components/inbox/InboxFilters.tsx`**
- When `activeTab` is `'notifications'` or `'read'`, hide the "Read Status" dropdown since it's redundant

### Risk & Impact
- **Data impact**: None — read-only filter change
- **Regression risk**: Low — only affects tab filtering, no data mutations
- **UI/UX**: Cleaner inbox; users see actionable unread items first
- **Mitigation**: Read tab preserves access to all historical notifications

