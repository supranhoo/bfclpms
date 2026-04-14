

## Fix: "Remember Me" Not Working

### Root Cause
The current implementation uses `beforeunload` to call `supabase.auth.signOut()`, which is unreliable because:
- `beforeunload` does not wait for async operations
- Supabase's session token in `localStorage` persists regardless
- `beforeunload` doesn't fire in all scenarios (mobile, crashes, force-quit)

### Solution
Instead of trying to sign out on close, control **where Supabase stores the session**:
- **Remember Me ON** (default): Use `localStorage` — session survives browser restart
- **Remember Me OFF**: Use `sessionStorage` — session auto-clears when all tabs close

### Implementation

**1. `src/integrations/supabase/client.ts`** — Cannot edit (auto-generated). Instead, create a wrapper that re-initializes the client with the correct storage.

**2. New file: `src/lib/authStorage.ts`**
- Export a helper that reads `pms_remember_me` from `localStorage`
- Provide a function to create/recreate the Supabase client with the appropriate `auth.storage` option (`localStorage` vs `sessionStorage`)
- On login with "Remember Me" unchecked, migrate the session from `localStorage` to `sessionStorage`

**3. `src/contexts/AuthContext.tsx`**
- After successful `signIn`, if `rememberMe === false`:
  - Save the preference flag in `localStorage` (this flag itself must survive)
  - Get the current session, store it in `sessionStorage`
  - Clear the Supabase auth keys from `localStorage`
- On app init (`getSession` / `onAuthStateChange`):
  - Check the `pms_remember_me` flag
  - If `false`, ensure Supabase reads from `sessionStorage`
- Remove the `beforeunload` listener entirely (no longer needed)

**4. `DOCUMENTATION.md` / `POLICY.md`** — Version bump, changelog.

### Technical Detail
Since we cannot edit `client.ts`, the approach is:
- Create a second Supabase client instance with `sessionStorage` as auth storage
- Export a `getActiveSupabaseClient()` function that returns the correct client based on the remember-me flag
- Update `AuthContext` to use this function for auth operations
- All other app code continues using the default client (which uses `localStorage`)

Alternatively (simpler): after login with remember-me off, manually move the Supabase session tokens from `localStorage` to `sessionStorage` and delete them from `localStorage`. On next page load, copy them back from `sessionStorage` to `localStorage` before Supabase initializes, and clear `localStorage` copies again via a `beforeunload` that only needs to do synchronous `localStorage.removeItem()` calls (no async signOut).

### Recommended Approach (Simplest)
Use synchronous `localStorage` manipulation in `beforeunload` instead of async `signOut`:

```typescript
const handleBeforeUnload = () => {
  if (localStorage.getItem('pms_remember_me') === 'false') {
    // Synchronous — guaranteed to execute before browser closes
    const storageKey = `sb-${projectRef}-auth-token`;
    localStorage.removeItem(storageKey);
  }
};
```

This is reliable because `localStorage.removeItem()` is synchronous. When the user returns, Supabase finds no token and requires re-login.

### Risk Assessment
- **Data impact**: None
- **Regression risk**: Low — only affects auth session storage, not app data
- **Edge case**: If user has multiple tabs open with "Remember Me" off, closing one tab clears the session for all tabs. This is acceptable behavior (matches user expectation of "don't remember me").

