

# Fix: Password Rollout Emails Not Sent

## Root Cause

The edge function logs show: **"Event type password_rollout is not enabled"**

The `send-email-notification` function checks if the event type is in the admin's enabled events list before sending. The `password_rollout` event was added as a template in the edge function but was **never registered in the frontend**, so admins cannot enable it.

Two pieces are missing:

1. The `EmailEventType` union type doesn't include `'password_rollout'`
2. The `EMAIL_EVENTS` toggle list in the Email Notification Settings UI doesn't include it

## Changes

### 1. `src/hooks/useEmailNotificationSettings.ts` (line ~21)

Add `'password_rollout'` to the `EmailEventType` union:

```
| 'observation_resolved'
| 'password_rollout';   // <-- add this
```

### 2. `src/components/admin/EmailNotificationSettings.tsx` (line ~48, after observation_resolved)

Add the event to the `EMAIL_EVENTS` array so it appears as a toggle in the UI:

```
{ key: 'password_rollout', label: 'Password Rollout', description: 'Send login credentials when admin generates passwords for users' },
```

### 3. `DOCUMENTATION.md`

Update the email events list to include `password_rollout` as the 22nd supported event type.

## After Deploying

Once these changes are live, go to **System Settings -> Email Notifications** and toggle on the new **"Password Rollout"** event. Then retry the password rollout -- emails will be sent.
