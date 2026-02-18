
# Fix: Email Change "AuthSessionMissingError" in Edge Function

## Exact Error

```
AuthSessionMissingError: Auth session missing!
at $._useSession (auth-js.mjs)
at $._updateUser (auth-js.mjs)
```

This error happens when Jaspal tries to change his email address from the Profile Settings page.

## Root Cause

The current code in `supabase/functions/update-user-profile/index.ts` (lines 108-120) creates a user-scoped Supabase client and calls:

```typescript
await supabaseUser.auth.updateUser({ email: newEmail }, { emailRedirectTo: ... });
```

The Supabase JS SDK's `auth.updateUser()` method calls an internal `_useSession()` function. This function looks for a stored session in the client's in-memory or local storage. In an Edge Function environment (Deno), there is no browser session storage — the client is created fresh on every request with no persisted state. Even though the `Authorization` header is passed to `global.headers`, the auth sub-client treats this as an unauthenticated client because no session was ever established.

## The Fix

Bypass the SDK's `auth.updateUser()` entirely and make a **direct `fetch()` call** to the Supabase Auth REST API endpoint instead. This is exactly what `updateUser` does internally — it makes a `PUT /auth/v1/user` request with the Bearer token — but without the session check.

```typescript
// BEFORE (broken in edge function — requires browser session)
const supabaseUser = createClient(URL, ANON_KEY, {
  global: { headers: { Authorization: authHeader } },
  auth: { autoRefreshToken: false, persistSession: false },
});
await supabaseUser.auth.updateUser({ email: newEmail });

// AFTER (direct REST call — works in edge function)
const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
  method: 'PUT',
  headers: {
    'Authorization': authHeader,
    'apikey': Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    email: newEmail,
    data: {},   // preserve existing metadata
  }),
});
```

This triggers Supabase's standard email verification flow (sends confirmation link to the new address) because it's calling the same Auth endpoint with the user's own token — not the admin token.

## What Changes

### File: `supabase/functions/update-user-profile/index.ts`

Replace the `update_email` block (lines 88–134) with a direct fetch-based implementation:

- Remove the user-scoped `createClient` call (not needed)
- Replace `supabaseUser.auth.updateUser()` with a `fetch()` call to `${SUPABASE_URL}/auth/v1/user` using `PUT` method
- Pass `Authorization: authHeader` and `apikey: ANON_KEY` headers
- Parse the response JSON and surface any auth errors properly
- Keep the same success toast message for the user: "A verification email has been sent..."

No other files need to change. The edge function redeploys automatically.

## Why This Works

The Supabase Auth server (GoTrue) accepts a `PUT /auth/v1/user` request with a valid user JWT and triggers the email change flow (including sending a confirmation email to the new address). This is the identical HTTP call the SDK makes — we're just skipping the SDK's client-side session guard that blocks edge function usage.

## Security

- The user's own JWT (`authHeader`) is used, not the service role key — so the email change is correctly scoped to the requesting user
- Supabase's built-in verification flow still applies: the old email stays active until the user clicks the confirmation link in the new email
- No admin bypass — this is a standard user-initiated email change

## Files to Modify

| File | Change |
|---|---|
| `supabase/functions/update-user-profile/index.ts` | Replace `supabaseUser.auth.updateUser()` with direct `fetch()` to Auth REST API |
| `DOCUMENTATION.md` | Version bump to 1.45.14 + note about edge function email fix |
