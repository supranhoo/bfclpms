
# Fix: Email Confirmation Flow & Mobile Number Update Timing

## Root Cause Analysis

### Issue 1: Email Confirmation Not Working

**The bug**: In `supabase/functions/update-user-profile/index.ts`, the `update_email` operation uses the **Admin API**:
```typescript
await supabaseAdmin.auth.admin.updateUserById(user.id, { email: newEmail, email_confirm: false })
```

`email_confirm: false` on the **admin API** means "do NOT confirm the email" — it still **immediately replaces** the email without sending any verification email to the user. The admin API bypasses the standard email change flow entirely.

**The fix**: Switch to using the **user's own session token** with the regular `auth.updateUser()` call (anon client scoped to the user's JWT). This triggers Supabase's built-in email change flow which sends verification emails to both the old and new addresses — standard behavior that requires the user to click a link to confirm.

```typescript
// CORRECT approach — uses user's session to trigger verification flow
const supabaseUser = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  global: { headers: { Authorization: authHeader } },
  auth: { autoRefreshToken: false, persistSession: false }
});

const { error } = await supabaseUser.auth.updateUser({ email: newEmail });
```

---

### Issue 2: Mobile Number Not Updating in UI on Time

**The bugs** (two compounding problems):

**Bug A**: In `handleSaveMobile` (ProfileSettings.tsx line 278-279), the call order is:
```typescript
queryClient.invalidateQueries({ queryKey: ['profiles'] });
refreshProfile();   // ← NOT awaited!
```
`refreshProfile()` is not awaited, so the next render may happen before `fetchProfile` completes, showing the old mobile number. By the time `fetchProfile` updates `AuthContext`, the component may have already re-rendered with stale data.

**Bug B**: `currentMobile` is derived from `profile?.mobile_number` at render-time. After a successful save, the component closes the edit field (`setEditingMobile(false)`) and re-renders — but since `refreshProfile()` is not awaited, `profile` in AuthContext still has the old value for that render cycle. The user sees the old mobile number until the async refresh completes.

**The fix**:
1. `await refreshProfile()` before `setEditingMobile(false)` so the profile is fresh when the field closes
2. Update `refreshProfile` to correctly `await fetchProfile` (it already does this, but the caller must also await it)
3. After a successful mobile save, also update the local display state optimistically so the UI shows the new value immediately without waiting for the async refresh

---

## Files to Modify

| File | Change |
|---|---|
| `supabase/functions/update-user-profile/index.ts` | Replace admin `updateUserById` email call with user-scoped `auth.updateUser()` to trigger real verification email |
| `src/pages/ProfileSettings.tsx` | (1) Await `refreshProfile()` in `handleSaveMobile`; (2) Add optimistic local state for mobile display so field shows new value immediately after save |
| `DOCUMENTATION.md` | Version bump to 1.45.13 |

---

## Detailed Changes

### `supabase/functions/update-user-profile/index.ts` — Email Fix

Replace the current `update_email` block:

```typescript
// BEFORE (broken — admin API does not trigger verification email)
const { error: updateAuthError } = await supabaseAdmin.auth.admin.updateUserById(
  user.id,
  { email: newEmail, email_confirm: false }
);
```

With a user-scoped client that triggers the standard verification flow:

```typescript
// AFTER — user-scoped call sends confirmation email to old+new address
const supabaseUser = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_ANON_KEY') ?? '',
  {
    global: { headers: { Authorization: authHeader } },
    auth: { autoRefreshToken: false, persistSession: false }
  }
);

const { error: updateAuthError } = await supabaseUser.auth.updateUser(
  { email: newEmail },
  { emailRedirectTo: Deno.env.get('SITE_URL') ?? 'https://bfclpms.lovable.app' }
);
```

The `authHeader` variable is already captured earlier in the function (line 21), so this is a clean change.

### `src/pages/ProfileSettings.tsx` — Mobile Update Timing Fix

**Change 1**: Await `refreshProfile()` in `handleSaveMobile` and close the editing field only after the profile is fresh:

```typescript
// BEFORE
toast({ title: 'Mobile number updated' });
setEditingMobile(false);
queryClient.invalidateQueries({ queryKey: ['profiles'] });
refreshProfile();   // not awaited

// AFTER
toast({ title: 'Mobile number updated' });
setEditingMobile(false);
await refreshProfile();   // awaited — AuthContext profile updated before next render
```

**Change 2**: Add an optimistic local mobile state so the displayed value updates instantly without waiting for the async DB re-fetch (belt-and-suspenders approach):

```typescript
// Add local optimistic state
const [localMobile, setLocalMobile] = useState<string | null>(null);
const currentMobile = localMobile ?? (profile as any)?.mobile_number ?? '';

// In handleSaveMobile after success:
setLocalMobile(editMobile || null);
setEditingMobile(false);
await refreshProfile(); // then sync with DB
setLocalMobile(null);   // clear optimistic state once real profile is loaded
```

This ensures:
- The field closes immediately showing the new value (optimistic)
- The AuthContext profile is then refreshed from DB in the background
- Once fresh, `localMobile` is cleared and the component uses the authoritative `profile.mobile_number`

---

## Technical Notes

- No database migrations needed
- No new secrets required — `SUPABASE_ANON_KEY` and `SUPABASE_URL` are already available in the edge function environment
- The `authHeader` variable is already captured at line 21 of the edge function, so it can be reused for the user-scoped client without any extra extraction
- The email change verification flow is entirely handled by the Supabase auth backend — when `auth.updateUser({ email })` is called with a user JWT, it automatically sends a confirmation email to the new address and holds the change pending until confirmed
- No SMTP configuration changes needed — the verification email goes through Supabase's own email service (separate from the custom SMTP used for PMS notifications)
- `emailRedirectTo` points to the production URL so users land back on the live app after clicking the email confirmation link
