

# Fix SMTP Password Input

## Problem
The SMTP password field in System Settings > Email is currently read-only with a hardcoded `"••••••••"` value. There is no way to enter or change the SMTP password from the UI.

The `SMTP_PASSWORD` secret exists in the backend, but the admin panel has no mechanism to update it.

## Solution
Add an editable password field with a "Update Password" button that saves the new password via a backend function.

### Changes

**1. Update `src/components/admin/EmailNotificationSettings.tsx`**
- Replace the read-only password input with an editable field
- Add a local state variable `smtpPassword` (empty by default, placeholder shows "Enter new password" or "Password is set" if already configured)
- Add an "Update Password" button next to the field
- When clicked, call the edge function to securely store the password
- Show success/error feedback via toast

**2. Update `supabase/functions/send-email-notification/index.ts`**
- Add a new request type `update_smtp_password` that accepts a password string
- The function will use the Supabase Management API (or store it via `Deno.env`) -- actually, since secrets can only be set via the Lovable secrets system, the approach will be different:

**Revised approach**: Since backend secrets cannot be programmatically updated from edge functions, the password update will go through a dedicated edge function that stores the SMTP password in an encrypted column in the `system_settings` table instead.

**Actually, simplest correct approach**: Create a small edge function `update-smtp-password` that receives the password and stores it encrypted in `system_settings`. Then update `send-email-notification` to read from that setting as a fallback if the `SMTP_PASSWORD` env secret is not set.

### Detailed Plan

**Step 1: Backend function `update-smtp-password`** (new edge function)
- Accepts `{ password: string }` in POST body
- Requires authentication and admin role check
- Stores the password in `system_settings` table under key `smtp_password_encrypted`
- Returns success/failure

**Step 2: Update `send-email-notification`**
- When reading the SMTP password, check `Deno.env.get("SMTP_PASSWORD")` first
- If not found, fall back to reading `smtp_password_encrypted` from `system_settings`
- This ensures both the secret-based and UI-based approaches work

**Step 3: Update `EmailNotificationSettings.tsx`**
- Replace the read-only input with an editable password field
- Add state: `smtpPassword` (string), `isUpdatingPassword` (boolean)
- Add "Update Password" button that calls the new edge function
- Show the eye toggle for visibility
- Helper text: "Enter your SMTP password. It will be stored securely."

**Step 4: Update `DOCUMENTATION.md`**
- Document the SMTP password storage mechanism

## Technical Notes
- The password is stored in `system_settings` as a regular setting. While not truly encrypted at rest (beyond database-level encryption), it is protected by RLS (admin-only access) and never exposed to the frontend after saving.
- The edge function reads it server-side only.
- The `SMTP_PASSWORD` environment secret takes priority if set, giving admins two options.

## Risk
- Low risk: additive change only
- Password is protected by admin-only RLS on `system_settings` and authenticated-only access to the edge function

