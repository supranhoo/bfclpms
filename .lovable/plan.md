
# Fix: Email Change Confirmation — Wrong Sender & Wrong Recipient

## Two Distinct Problems Identified

---

### Problem 1: Email sent from wrong address (`no-reply@auth.lovable.cloud`)

**What's happening:**
The "Confirm your email change" email is being sent by the platform's **built-in auth system** directly — not through the organization's configured Microsoft Graph sender (`hrms@bfclalloys.com`).

**Why:**
The `update-user-profile` edge function's `update_email` operation calls `PUT /auth/v1/user` via the GoTrue REST API. This triggers GoTrue's own email delivery pipeline, which uses the platform's default sender (`no-reply@auth.lovable.cloud`). GoTrue has **no knowledge** of the Microsoft Graph SMTP credentials stored in `system_settings`. Those credentials are only used by the `send-email-notification` edge function.

**The fix:**
Bypass GoTrue's email delivery entirely. Instead of triggering the GoTrue email change flow, we use the **Admin API** to update the email instantly (same as the admin `update-user-email` function does — `email_confirm: true`), and then send our **own** confirmation email through `send-email-notification` using the organization's Microsoft Graph sender.

The flow becomes:
1. Admin API instantly sets the new email on the auth record (confirmed, no GoTrue confirmation needed)
2. Our `send-email-notification` edge function sends a branded notification email from `hrms@bfclalloys.com` informing the user that their email was changed

---

### Problem 2: "to ." — New email appears blank in the email body

**What's happening:**
The screenshot shows: *"You requested to update your email address from jaspal.bhanker@bfclalloys.com to ."* — the new email destination is blank.

**Why:**
This is because GoTrue's confirmation email template shows the **pending new email** from the auth record. When the request was made, the `newEmail` field was either empty, or this is a display artifact of GoTrue's email template when the `email_change_token_new` is set but the `email_change` field hasn't fully propagated. The blank "to" in GoTrue's template is a known behavior when the email change is in a pending state.

Regardless, this problem disappears entirely once we switch away from the GoTrue email flow (fixing Problem 1 also fixes this).

---

### Problem 3: Confirmation sent to OLD email instead of NEW email

GoTrue's default behavior when a user changes their email is to:
- Send a confirmation link to the **OLD email** saying "click to confirm you want to change"
- AND/OR send a confirmation link to the **NEW email** saying "click to confirm your new address"

Since Jaspal initiated this from Profile Settings (self-service), the confirmation went to his current (old) email. This is correct GoTrue behavior but not what the organization wants — they want the change to be immediate (as the admin flow already does with `email_confirm: true`).

---

## Solution Architecture

### For Self-Service Email Change (`update-user-profile` / `update_email` operation)

Replace the GoTrue user-facing REST call with the same Admin API approach used by the admin `update-user-email` function:

```
BEFORE (broken):
  PUT /auth/v1/user  ← user's JWT → triggers GoTrue email from wrong sender

AFTER (fixed):
  supabaseAdmin.auth.admin.updateUserById(user.id, { email: newEmail, email_confirm: true })
  → Instant update, no GoTrue email
  
  send-email-notification({ event_type: 'email_changed', recipient: user, new_email: newEmail })
  → Our email, from hrms@bfclalloys.com via Microsoft Graph
```

### New Email Template Event

Add a new `email_changed` event type to the notification system so the `send-email-notification` function sends a proper branded "Your email address has been updated" notification to the user at their **new** address.

---

## Files to Modify

| File | Change |
|---|---|
| `supabase/functions/update-user-profile/index.ts` | Replace direct GoTrue REST call with Admin API (`updateUserById` with `email_confirm: true`) + call `send-email-notification` |
| `supabase/functions/send-email-notification/index.ts` | Add `email_changed` event type handler |
| `src/hooks/useEmailNotificationSettings.ts` | Add `email_changed` to `EmailEventType` union |
| `DOCUMENTATION.md` | Version bump to 1.45.17 |

---

## Technical Detail: Why Admin API + Our Email Is Better

| Approach | Sender | Confirmation flow | New email shown |
|---|---|---|---|
| Current (`PUT /auth/v1/user`) | `no-reply@auth.lovable.cloud` | GoTrue sends to OLD email | Blank in template |
| Admin API + our email | `hrms@bfclalloys.com` | Our email to NEW address | Correct new email |

The Admin API with `email_confirm: true` updates the auth record immediately (no pending state), then we send a clean branded notification to the **new** email address confirming the change. This is consistent with how the admin's User Management email change already works.

---

## Security Note

This is safe because:
- The user must be authenticated (their JWT is verified) before the Admin API call is made
- The new email is validated with regex before being applied
- The change is logged in the edge function console
- The user receives a notification at their new email so they know the change happened

The only difference vs. the GoTrue confirmation flow is that there is no "click to confirm" step — but this matches the organization's existing behavior for admin-initiated email changes, and is appropriate for a controlled enterprise HR system.

---

## What Changes for Jaspal

After this fix:
1. Jaspal (or any user) edits their email in Profile Settings
2. The change applies immediately to their login credentials
3. A branded email from `hrms@bfclalloys.com` arrives at the **new** email address: "Your email has been updated to [new email]"
4. No more emails from `no-reply@auth.lovable.cloud`
5. No more "to ." blank destination in the email body
