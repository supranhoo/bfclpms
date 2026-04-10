

## Plan: Add "Remember Me" Checkbox to Login

### How It Works

Supabase Auth uses JWT refresh tokens. By default, `signInWithPassword` persists the session in localStorage (long-lived). The "Remember Me" feature will:

- **Checked (default)**: Keep current behavior — session persists across browser restarts via localStorage
- **Unchecked**: Store a flag so that on `beforeunload` (tab/browser close), the app calls `supabase.auth.signOut()` to clear the session, forcing re-login next visit

### Changes

#### 1. `src/pages/Auth.tsx`
- Add `rememberMe` state (default `true`)
- Add a styled Checkbox between the password field and Sign In button: `☐ Remember me`
- Pass `rememberMe` to `signIn(email, password, rememberMe)`

#### 2. `src/contexts/AuthContext.tsx`
- Update `signIn` signature to accept `rememberMe: boolean`
- After successful login, store `localStorage.setItem('pms_remember_me', rememberMe ? 'true' : 'false')`
- Add a `useEffect` that registers a `beforeunload` listener: if `pms_remember_me === 'false'` and a session exists, call `supabase.auth.signOut()` to clear the session on browser/tab close
- On sign-out, clean up the `pms_remember_me` flag

#### 3. `DOCUMENTATION.md` / `POLICY.md`
- Document the Remember Me feature and version bump

### UI Placement

```text
Password [__________] Forgot?
☐ Remember me
[      Sign In  →      ]
Secure & Encrypted
```

### Risk Assessment
- **Data impact**: None — no schema changes
- **Regression risk**: Low — only adds an optional client-side session cleanup behavior
- **Security**: Improved — users on shared machines can opt out of persistent sessions

