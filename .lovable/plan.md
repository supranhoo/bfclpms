
# Snooze & Reminders for Inbox

## Overview
Add the ability to snooze notifications and queries so they disappear from the main inbox and re-surface at a chosen time. Includes a dedicated "Snoozed" tab, snooze count tracking, and smart suggestions for repeatedly-snoozed items.

## What You'll Get
- A snooze button on each inbox row with preset options (1 hour, 4 hours, Tomorrow, Next Week) plus a custom date/time picker
- Snoozed items hidden from the main tabs until their snooze time expires, then they reappear automatically
- A new "Snoozed" tab showing all currently-snoozed items with the option to un-snooze early
- Smart suggestion banner: items snoozed 3+ times prompt "Mark as resolved?" or "Dismiss permanently?"
- Snooze count badge visible on items that have been deferred multiple times

## Technical Details

### 1. Database Migration
Add two columns to the `notifications` table:

```sql
ALTER TABLE notifications
  ADD COLUMN snoozed_until TIMESTAMPTZ,
  ADD COLUMN snooze_count INTEGER NOT NULL DEFAULT 0;
```

### 2. New Hook: `src/hooks/useSnoozeNotification.ts`
- `useSnoozeNotification()` mutation: updates `snoozed_until` and increments `snooze_count` for a given notification ID
- `useUnsnoozeNotification()` mutation: clears `snoozed_until` (sets to null)
- Both invalidate the `paginated-notifications` and `unread-notification-count` query keys on success

### 3. Snooze Popover Component: `src/components/inbox/SnoozePopover.tsx`
- Triggered from a clock/snooze icon button on each `InboxRowItem`
- Preset options: 1 Hour, 4 Hours, Tomorrow 9 AM, Next Monday 9 AM
- "Custom" option opens a date-time picker (using the existing calendar component + time input)
- On selection, calls the snooze mutation and shows a toast confirmation with the snooze-until time

### 4. Update `InboxRowItem.tsx`
- Add the `SnoozePopover` trigger button in the Actions cell (next to the existing quick-action and view buttons)
- Show a small snooze-count badge (e.g., "Snoozed x3") if `snooze_count >= 2`

### 5. Update `usePaginatedNotifications.ts`
- Default query: add filter `.or('snoozed_until.is.null,snoozed_until.lte.${now}')` to exclude currently-snoozed items from the main notifications tab
- New option `showSnoozed?: boolean`: when true, query only items where `snoozed_until > now` (for the Snoozed tab)

### 6. New "Snoozed" Tab in `QueryInbox.tsx`
- Add a tab with a clock icon between "Team" and "Insights"
- Uses `usePaginatedNotifications` with `showSnoozed: true`
- Each row shows the snooze-until time and an "Un-snooze" button
- Smart suggestion: if an item has `snooze_count >= 3`, show a banner/badge saying "Snoozed 3 times -- Mark as read?" with a one-click action

### 7. Update `InboxItem` type in `inboxUtils.ts`
- Add optional fields: `snoozedUntil?: string | null` and `snoozeCount?: number`
- Pass these through when mapping notifications to `InboxItem` objects in `QueryInbox.tsx`

### 8. Client-side Filter Update
- `filterInboxItems()` in `inboxUtils.ts`: items with a future `snoozedUntil` are excluded from non-snoozed views (defense-in-depth alongside the server filter)

### 9. Update `DOCUMENTATION.md`
- Document the snooze feature, new columns, hook, and smart suggestion logic

## File Changes Summary
| File | Action |
|------|--------|
| Database migration (notifications table) | New columns |
| `src/hooks/useSnoozeNotification.ts` | New file |
| `src/components/inbox/SnoozePopover.tsx` | New file |
| `src/components/inbox/InboxRowItem.tsx` | Add snooze button + count badge |
| `src/components/inbox/InboxTable.tsx` | Pass snooze handlers through |
| `src/hooks/usePaginatedNotifications.ts` | Filter snoozed items, add snoozed-only mode |
| `src/pages/QueryInbox.tsx` | Add Snoozed tab, wire snooze handlers |
| `src/lib/inboxUtils.ts` | Extend InboxItem type, add client filter |
| `src/components/inbox/index.ts` | Export new component |
| `DOCUMENTATION.md` | Document feature |
