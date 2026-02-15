

# Plan: Admin Change Email Feature

## Overview

Add an "Edit Email" capability to User Management so admins can change any user's email address. This uses the Auth Admin API (`updateUserById`) via a new edge function, updating both the auth system and the `profiles` table atomically.

## What Changes

### 1. New Edge Function: `update-user-email`

A backend function (following the same security pattern as `reset-password`) that:
- Validates the calling admin's JWT token
- Confirms the caller has the `admin` role
- Validates the new email format
- Calls `supabaseAdmin.auth.admin.updateUserById(userId, { email: newEmail })` to update the auth record instantly (no confirmation email)
- Updates the `profiles.email` column to keep the database in sync
- Returns success/error response

### 2. Update User Management UI (`UserManagement.tsx`)

- Make the Email field in the Edit User dialog **editable** (currently it is `readOnly` and `disabled`)
- When saving, if the email has changed, call the new `update-user-email` edge function before saving other profile fields
- Show appropriate success/error toast messages

### 3. Configuration

- Add `[functions.update-user-email] verify_jwt = false` to `supabase/config.toml` (JWT validated in code, same as other functions)

### 4. Documentation

- Update `DOCUMENTATION.md` with the new feature

## Technical Details

### Edge Function: `supabase/functions/update-user-email/index.ts`

```text
Request:  POST { userId, newEmail }
Auth:     Bearer token (admin-only, validated in code)
Process:  
  1. Validate admin caller
  2. Validate email format
  3. auth.admin.updateUserById(userId, { email: newEmail })
  4. profiles.update({ email: newEmail }).eq('id', userId)
Response: { success: true } or { error: "..." }
```

### UI Change (Edit Dialog)

The email field on line 764-771 changes from disabled/readonly to editable. On save, if email differs from the original, the edge function is invoked first, then the existing profile update runs.

## Files Changed

| File | Change |
|---|---|
| `supabase/functions/update-user-email/index.ts` | New edge function |
| `supabase/config.toml` | Add function config (auto-managed) |
| `src/pages/admin/UserManagement.tsx` | Make email editable in Edit dialog; call edge function on email change |
| `DOCUMENTATION.md` | Document the feature |

## Risk Assessment

- Low risk -- uses the same proven admin API pattern as password reset
- No schema migration needed (`profiles.email` column already exists)
- Email change is instant (no confirmation step) -- admin-controlled by design
- User's password and all relational data (user_id) remain unchanged

