
# Fix: `email_changed` Email Not Sent — Event Gate Bypass + DB Correction

## Root Cause (Confirmed from Logs)

The edge function logs show the exact failure chain:

```
[send-email-notification] Event type email_changed is not enabled
```

The `send-email-notification` function at **line 1029** checks whether the `event_type` exists in the `email_notification_events` array stored in `system_settings`. The `email_changed` event was never added to that array when the feature was built, so every email change notification is silently skipped.

The `email_changed` template IS defined in the function (line 515) — the problem is purely the event gate check at line 1029 blocking it before the template is ever reached.

---

## Two-Part Fix

### Part 1: Edge Function — Exempt `email_changed` from the event gate

`email_changed` is a **security-critical notification** (like a password reset confirmation) — it must always send, regardless of admin toggle settings. An admin should never be able to accidentally disable email change confirmations by unchecking an event type.

The fix adds a whitelist of always-on events that bypass the `enabledEvents.includes()` check:

```typescript
// BEFORE (line 1029):
if (!enabledEvents.includes(event_type)) {
  // ...skips
}

// AFTER:
const ALWAYS_SEND_EVENTS = ['email_changed', 'password_rollout'];

if (!ALWAYS_SEND_EVENTS.includes(event_type) && !enabledEvents.includes(event_type)) {
  // ...skips only if not always-on AND not in admin-enabled list
}
```

This ensures `email_changed` always fires. `password_rollout` is also included since it's similarly security-critical.

### Part 2: Database — Add `email_changed` to enabled events

As a defence-in-depth measure, `email_changed` should also be added to the `email_notification_events` array in `system_settings`. This ensures:
- The Email Notification Settings UI shows `email_changed` as enabled
- Admins can see it in the event list
- If the always-on exemption is ever removed, it still works

This is a direct SQL upsert on `system_settings` to append `email_changed` to the existing events array.

---

## Files to Modify

| File | Change |
|---|---|
| `supabase/functions/send-email-notification/index.ts` | Add `ALWAYS_SEND_EVENTS` constant; modify the event gate at line 1029 to bypass it for `email_changed` (and `password_rollout`) |
| `DOCUMENTATION.md` | Version bump to 1.45.18 |

## Database Change

One SQL update to `system_settings` to add `email_changed` to the `email_notification_events` array — executed via a migration.

## What Changes for Jaspal (and Future Users)

After this fix:
1. User changes their email in Profile Settings
2. `update-user-profile` edge function updates the auth record instantly and calls `send-email-notification` with `event_type: email_changed`
3. `send-email-notification` recognizes `email_changed` as an always-on event — **skips the event gate**
4. Email is sent from `hrms@bfclalloys.com` via Microsoft Graph to the **new** email address

**Note:** Jaspal's email has already been changed in the auth system (`jaspal.bhanker@bfclalloys.com → jaspalbhanker@gmail.com` — confirmed in logs). The change itself succeeded. Only the notification failed. This fix prevents this from happening for future email changes.
