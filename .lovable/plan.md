

## Add "@Mentioned" to Notification Type Filter

### Change
Add `observation_mention` as a selectable option in the notification type dropdown on the Inbox Filters.

### File: `src/components/inbox/InboxFilters.tsx` (line 48)

Add one entry to the `NOTIFICATION_TYPES` array:

```typescript
{ value: 'observation_mention', label: '@Mentioned' },
```

Insert it after `query_responded` (line 48), before the closing bracket.

### No other files affected
The filter value is passed directly to the `usePaginatedNotifications` hook which already filters by `.eq('type', filters.notificationType)` — no backend changes needed.

