

# Add Observation Events to Email Notification Settings UI

## Problem

The database triggers for observation notifications (`observation_raised`, `observation_reply`, `observation_resolved`) were created, but the frontend was not updated. Two places need changes:

1. **`src/hooks/useEmailNotificationSettings.ts`** -- the `EmailEventType` union type is missing the three new values
2. **`src/components/admin/EmailNotificationSettings.tsx`** -- the `EMAIL_EVENTS` array is missing the three new entries

## Changes

### 1. `src/hooks/useEmailNotificationSettings.ts`

Add three new values to the `EmailEventType` union:

```typescript
| 'observation_raised'
| 'observation_reply'
| 'observation_resolved'
```

### 2. `src/components/admin/EmailNotificationSettings.tsx`

Add three entries to the `EMAIL_EVENTS` array (after the PIP entries):

```typescript
{ key: 'observation_raised', label: 'Observation Raised', description: 'Notify KPI owner when a new observation is raised on their KPI' },
{ key: 'observation_reply', label: 'Observation Reply', description: 'Notify participants when someone replies to an observation' },
{ key: 'observation_resolved', label: 'Observation Resolved', description: 'Notify participants when an observation is marked as resolved' },
```

### 3. `DOCUMENTATION.md`

Update the email event count and list to include the three observation events if not already present.

## Result

After this change, the three observation notification types will appear as toggleable checkboxes under System Settings > Email > Notification Events, allowing admins to enable or disable email notifications for each observation activity.

