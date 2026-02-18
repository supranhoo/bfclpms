
# Fix: Profile Settings Email — Three Bugs to Resolve

## Summary of All Identified Issues

From the two screenshots, there are exactly three distinct bugs:

---

### Bug 1: Wrong hint text on the UI — "A verification link will be sent"

**Location:** `src/pages/ProfileSettings.tsx` line 407

**What it says:**
> "A verification link will be sent to your new email address."

**What it should say:**
> "Your email will be updated immediately. A confirmation will be sent to your new address."

The current system uses the Admin API with `email_confirm: true` — there is NO verification link step. No click is required. The change is instant. This hint text is left over from the old GoTrue flow and is factually incorrect.

**Fix:** Change the `hint` string in `InlineField` for email to accurately describe the instant update behavior.

---

### Bug 2: Email shows same address for "Previous Email" and "New Email"

**Location:** `supabase/functions/update-user-profile/index.ts` lines 107–161

**Root cause:**
The edge function captures `oldEmail = user.email ?? ''` from the **JWT token** BEFORE updating the auth record. However, because the Admin API call (`updateUserById`) succeeds first, and then the `profiles` table is updated — by the time the `send-email-notification` call is made, both `old_email` and `new_email` resolve to the same value in the notification body.

**The real problem:** The JWT token's `user.email` reflects what was already in the system at the time the token was issued. If Jaspal's email was ALREADY `jaspalbhanker@gmail.com` (from a previous partial change), then `oldEmail` = `jaspalbhanker@gmail.com` and `newEmail` = `jaspalbhanker@gmail.com` — they are identical.

Additionally, the `newEmail` passed in the request body IS the email Jaspal typed, but there's no guard to prevent re-submitting the same email as a "new" one. The fix must:
1. Read the `old_email` from the `profiles` table BEFORE updating (not from the JWT token which may be stale)
2. Add a check: if `oldEmail === newEmail`, return early with a clear message "This is already your current email address"

**Fix:** In `update-user-profile/index.ts`, fetch the current email from the `profiles` table FIRST (which is always up-to-date), use that as `oldEmail`, then validate that `oldEmail !== newEmail` before proceeding.

---

### Bug 3: Email field in Profile Settings still shows old/stale email after save

**Location:** `src/pages/ProfileSettings.tsx` — the `handleSaveEmail` function (lines 233–257)

**What happens:**
After a successful email save, the function calls `setEditingEmail(false)` and shows a toast — but it does NOT refresh the auth session or profile. So the `user?.email` value displayed in the `InlineField` remains stale (showing the old email) even though the auth record has been updated.

The `user` object in AuthContext comes from the Supabase session, which has a cached email. After an Admin API email change, the **JWT is not automatically refreshed** in the client. The displayed email on the field stays as-is until the user logs out and back in.

**Fix:**
1. After a successful email save, call `supabase.auth.refreshSession()` to force the client to get the updated token with the new email
2. Then call `fetchProfile(user.id)` and `queryClient.invalidateQueries` to sync the profile state
3. Also update the toast message to say "Email updated successfully" (not "Verification email sent")

---

## All Files to Modify

| File | Bug Fixed | Change |
|---|---|---|
| `src/pages/ProfileSettings.tsx` | Bug 1 + Bug 3 | Fix hint text; add `supabase.auth.refreshSession()` + `fetchProfile` after email save; fix toast message |
| `supabase/functions/update-user-profile/index.ts` | Bug 2 | Fetch `old_email` from `profiles` table before updating; add same-email guard |
| `DOCUMENTATION.md` | All | Version bump to 1.45.19 |

---

## Detailed Technical Changes

### `supabase/functions/update-user-profile/index.ts` — `update_email` operation

**Before (line 107):**
```typescript
const oldEmail = user.email ?? '';
```

**After:**
```typescript
// Fetch from profiles table — always authoritative, not stale like the JWT token
const { data: currentProfile } = await supabaseAdmin
  .from('profiles')
  .select('email')
  .eq('id', user.id)
  .single();
const oldEmail = currentProfile?.email ?? user.email ?? '';

// Guard: prevent no-op updates
if (oldEmail.toLowerCase() === newEmail.toLowerCase()) {
  return new Response(
    JSON.stringify({ error: 'This is already your current email address.' }),
    { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}
```

This ensures `old_email` is always the ACTUAL current email from the database — not the potentially stale JWT claim. The notification will then correctly show different Previous/New Email values.

### `src/pages/ProfileSettings.tsx` — `handleSaveEmail` + hint text

**Hint text fix (line 407):**
```tsx
// BEFORE:
hint={editingEmail ? 'A verification link will be sent to your new email address.' : undefined}

// AFTER:
hint={editingEmail ? 'Your email will be updated immediately. A confirmation will be sent to your new address.' : undefined}
```

**`handleSaveEmail` fix — add session refresh after success:**
```typescript
// After success:
toast({ title: 'Email updated', description: 'Your email address has been updated successfully.' });
setEditingEmail(false);
// Refresh the auth session so user?.email shows the new value
await supabase.auth.refreshSession();
// Sync profile state in AuthContext + admin caches
await refreshProfile();
```

The `supabase.auth.refreshSession()` call forces the client to fetch a new JWT from the auth server — since the Admin API already updated the email in the auth record, the new token will contain the correct new email, and the UI will display it immediately.

---

## After These Fixes

| Before | After |
|---|---|
| Hint: "A verification link will be sent" | Hint: "Your email will be updated immediately..." |
| Email field still shows old email after save | Email field shows new email after save (session refreshed) |
| Email notification: Previous = New (both same) | Email notification: Previous = old address, New = new address |
| No same-email guard | Blocked with clear error: "This is already your current email address" |

